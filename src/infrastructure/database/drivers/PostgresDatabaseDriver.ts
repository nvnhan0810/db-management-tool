import type { DatabaseConnection } from '@/domain/connection/types';
import type { QueryResult } from '@/domain/query/types';
import {
  pgLiteral,
  pgQuoteIdent,
  sanitizeTableIdent,
} from '@/infrastructure/database/drivers/sqlFormat';
import type {
  DatabaseDriver,
  DriverConnection,
  ExportProgress,
  TableInfo,
  TableStructure,
  WriteChunk,
} from '@/infrastructure/database/drivers/types';
import { getPg } from '@/utils/native-modules';

export class PostgresDatabaseDriver implements DatabaseDriver {
  async connect(
    connection: DatabaseConnection,
    host: string,
    port: number
  ): Promise<import('pg').Pool> {
    const pgConfig: Record<string, unknown> = {
      host,
      port,
      user: connection.username,
      password: connection.password,
      connectionTimeoutMillis: 10000,
    };
    if (connection.database?.trim()) {
      pgConfig.database = connection.database.trim();
    }

    const { Pool } = getPg();
    const pgPool = new Pool(pgConfig as import('pg').PoolConfig);

    // Postgres containers often restart right after init scripts finish.
    // Add a small retry window for ECONNRESET/ECONNREFUSED.
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const client = await pgPool.connect();
        try {
          await client.query('SELECT NOW()');
        } finally {
          client.release();
        }
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!isRetryableConnectError(err) || attempt === 6) {
          await pgPool.end();
          throw err;
        }
        await sleep(250 * attempt);
      }
    }
    if (lastErr) throw lastErr;

    return pgPool;
  }

  async disconnect(connection: DriverConnection): Promise<void> {
    await (connection as import('pg').Pool).end();
  }

  async query(connection: DriverConnection, query: string): Promise<QueryResult> {
    const result = await (connection as import('pg').Pool).query(query);
    return {
      success: true,
      data: result.rows,
      fields: result.fields?.map((f: import('pg').FieldDef) => ({
        name: f.name,
        type: f.dataTypeID,
        length: f.dataTypeSize,
      })),
      rowCount: Array.isArray(result.rows) ? result.rows.length : 0,
    };
  }

  async executeQuery(connection: DriverConnection, query: string): Promise<QueryResult> {
    const result = await (connection as import('pg').Pool).query(query);
    return {
      success: true,
      data: result.rows,
      fields: result.fields?.map((f: import('pg').FieldDef) => ({
        name: f.name,
        type: f.dataTypeID,
        length: f.dataTypeSize,
      })),
      rowCount: result.rowCount ?? 0,
    };
  }

  async getTables(connection: DriverConnection): Promise<TableInfo[]> {
    const result = await (connection as import('pg').Pool).query(`
      SELECT table_name as name, table_type as type
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY table_name
    `);
    return result.rows.map((r: { name: string; type: string }) => ({
      name: r.name,
      type: r.type === 'BASE TABLE' ? 'table' : r.type === 'VIEW' ? 'view' : r.type,
    }));
  }

  async getTableStructure(
    connection: DriverConnection,
    _info: DatabaseConnection,
    tableName: string
  ): Promise<TableStructure> {
    const pgPool = connection as import('pg').Pool;
    const columns: TableStructure['columns'] = [];
    let rows: number | undefined;
    const indexes: NonNullable<TableStructure['indexes']> = [];
    let primaryKeyColumns: string[] = [];

    const fkResult = await pgPool.query(
      `
      SELECT
        kcu.column_name AS column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
      `,
      [tableName]
    );
    const fkByColumn = new Map<string, string>();
    for (const r of fkResult.rows as Array<Record<string, unknown>>) {
      const col = String(r.column_name || '');
      const ft = String(r.foreign_table_name || '');
      const fc = String(r.foreign_column_name || '');
      if (col && ft && fc) fkByColumn.set(col, `${ft}.${fc}`);
    }

    const colResult = await pgPool.query(
      `SELECT ordinal_position, column_name as name,
        CASE WHEN character_maximum_length IS NOT NULL THEN data_type || '(' || character_maximum_length || ')'
             WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL THEN data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
             WHEN numeric_precision IS NOT NULL THEN data_type || '(' || numeric_precision || ')'
             ELSE data_type END as type,
        (is_nullable = 'YES')::boolean as nullable,
        column_default as default_value, ''::text as extra, ''::text as comment
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    );
    columns.push(
      ...(colResult.rows as Array<Record<string, unknown>>).map((r) => ({
        name: r.name as string,
        type: r.type as string,
        nullable: Boolean(r.nullable),
        ordinal_position: r.ordinal_position as number,
        default_value: r.default_value as string,
        extra: r.extra as string,
        foreign_key: fkByColumn.get(String(r.name)) || undefined,
        comment: r.comment as string,
      }))
    );

    try {
      const countResult = await pgPool.query(
        `SELECT COUNT(*) as count FROM ${pgQuoteIdent(tableName)}`
      );
      rows = parseInt(String(countResult.rows[0]?.count || 0), 10);
    } catch {
      /* ignore */
    }

    try {
      const pkResult = await pgPool.query(
        `SELECT kcu.column_name AS name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         WHERE tc.table_schema = 'public'
           AND tc.table_name = $1
           AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.ordinal_position`,
        [tableName]
      );
      primaryKeyColumns = (pkResult.rows as Array<{ name: string }>).map((r) => String(r.name));
    } catch {
      primaryKeyColumns = [];
    }

    return { columns, rows, indexes, primaryKeyColumns };
  }

  async getDatabases(connection: DriverConnection): Promise<Array<{ name: string; tableCount?: number }>> {
    const result = await (connection as import('pg').Pool).query(
      `SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY datname`
    );
    return (result.rows as Array<{ name: string }>).map((r) => ({
      name: r.name,
      tableCount: 0,
    }));
  }

  async exportTableSql(
    connection: DriverConnection,
    table: string,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<string> {
    const chunks: string[] = [];
    await this.exportTableSqlToWriter(
      connection,
      table,
      async (chunk) => {
        chunks.push(chunk);
      },
      true,
      true,
      onProgress
    );
    return chunks.join('');
  }

  async exportTableSqlToWriter(
    connection: DriverConnection,
    table: string,
    write: WriteChunk,
    includeStructure: boolean,
    includeData: boolean,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<void> {
    const pool = connection as import('pg').Pool;
    const name = sanitizeTableIdent(table);
    const qTable = pgQuoteIdent(name);
    const vCheck = await pool.query(
      `SELECT view_definition FROM information_schema.views WHERE table_schema = 'public' AND table_name = $1`,
      [name]
    );
    if (vCheck.rows.length > 0) {
      const def = (vCheck.rows[0] as { view_definition: string }).view_definition;
      if (includeStructure) {
        await write(
          `-- View: ${name}\nDROP VIEW IF EXISTS ${qTable} CASCADE;\nCREATE OR REPLACE VIEW ${qTable} AS ${def};\n\n`
        );
      } else {
        await write(`-- View: ${name}\n-- (data only; views have no data)\n\n`);
      }
      return;
    }

    if (includeStructure) {
      const ddlResult = await pool.query(
        `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS typ
         FROM pg_attribute a
         JOIN pg_class c ON a.attrelid = c.oid
         JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [name]
      );
      const colRows = ddlResult.rows as Array<{ name: string; typ: string }>;
      if (colRows.length === 0) throw new Error(`Table not found: ${name}`);
      const colDefs = colRows.map((r) => `${pgQuoteIdent(r.name)} ${r.typ}`).join(',\n  ');
      await write(
        `-- Table: ${name}\nDROP TABLE IF EXISTS ${qTable} CASCADE;\nCREATE TABLE ${qTable} (\n  ${colDefs}\n);\n\n`
      );
    } else {
      await write(`-- Table: ${name}\n-- (data only)\n\n`);
    }

    if (!includeData) return;
    const batch = 200;
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${qTable}`);
    const total = Number(countResult.rows[0]?.count ?? 0);
    if (total === 0) return;

    const client = await pool.connect();
    let cursorOpen = false;
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      await client.query(`DECLARE export_cursor NO SCROLL CURSOR FOR SELECT * FROM ${qTable}`);
      cursorOpen = true;

      let rowsDone = 0;
      let cols: string[] | undefined;
      while (rowsDone < total) {
        const result = await client.query(`FETCH FORWARD ${batch} FROM export_cursor`);
        const rows = result.rows as Record<string, unknown>[];
        if (rows.length === 0) break;

        cols ??= Object.keys(rows[0]);
        const currentCols = cols;
        const colList = currentCols.map(pgQuoteIdent).join(',');
        const values = rows
          .map((r) => `(${currentCols.map((c) => pgLiteral(r[c])).join(',')})`)
          .join(',\n');
        await write(`INSERT INTO ${qTable} (${colList}) VALUES\n${values};\n\n`);

        rowsDone += rows.length;
        onProgress?.({ stage: 'table:batch', rowsDone, rowsTotal: total });
      }

      await client.query('CLOSE export_cursor');
      cursorOpen = false;
      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (cursorOpen) {
        try {
          await client.query('CLOSE export_cursor');
        } catch {
          /* ignore */
        }
      }
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async dropTable(connection: DriverConnection, tableName: string, tableType?: string): Promise<void> {
    const name = sanitizeTableIdent(tableName);
    const ident = pgQuoteIdent(name);
    const isView = tableType === 'view';
    const sql = isView
      ? `DROP VIEW IF EXISTS ${ident} CASCADE`
      : `DROP TABLE IF EXISTS ${ident} CASCADE`;
    await (connection as import('pg').Pool).query(sql);
  }

  async dropDatabase(
    connection: DriverConnection,
    info: DatabaseConnection,
    databaseName: string
  ): Promise<void> {
    const target = databaseName.trim();
    const lower = target.toLowerCase();
    const pgProtected = new Set(['postgres', 'template0', 'template1']);
    if (pgProtected.has(lower)) {
      throw new Error('Cannot drop a system database');
    }

    const pgPool = connection as import('pg').Pool;
    const { Pool } = getPg();
    // pg-pool stores password as non-enumerable; object spread omits it and breaks SCRAM auth.
    const o = (pgPool as unknown as { options: import('pg').PoolConfig }).options;
    const poolPassword =
      typeof o.password === 'string'
        ? o.password
        : typeof info.password === 'string'
          ? info.password
          : '';
    const adminPool = new Pool({
      host: o.host,
      port: o.port,
      user: o.user,
      password: poolPassword,
      database: 'postgres',
      ssl: o.ssl,
      connectionTimeoutMillis: o.connectionTimeoutMillis ?? 10000,
    });
    try {
      await adminPool.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [target]
      );
      await adminPool.query(`DROP DATABASE ${pgQuoteIdent(target)}`);
    } finally {
      await adminPool.end();
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableConnectError(err: unknown): boolean {
  const anyErr = err as { code?: unknown; message?: unknown };
  const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : '';
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED')
  );
}
