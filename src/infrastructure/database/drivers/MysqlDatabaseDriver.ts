import type { DatabaseConnection } from '@/domain/connection/types';
import type { QueryResult } from '@/domain/query/types';
import {
  mysqlLiteral,
  mysqlQuoteDatabaseIdent,
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
import mysql from 'mysql2/promise';

export class MysqlDatabaseDriver implements DatabaseDriver {
  async connect(
    connection: DatabaseConnection,
    host: string,
    port: number
  ): Promise<mysql.Connection> {
    return mysql.createConnection({
      host,
      port,
      user: connection.username,
      password: connection.password,
      database: connection.database,
    });
  }

  async disconnect(connection: DriverConnection): Promise<void> {
    await (connection as mysql.Connection).end();
  }

  async query(connection: DriverConnection, query: string): Promise<QueryResult> {
    const [rows, fields] = await (connection as mysql.Connection).query(query);
    return {
      success: true,
      data: rows as unknown[],
      fields: fields as unknown[],
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  }

  async executeQuery(connection: DriverConnection, query: string): Promise<QueryResult> {
    const [rows, fields] = await (connection as mysql.Connection).query(query);
    return {
      success: true,
      data: rows as unknown[],
      fields: (fields as Array<{ name: string; type: number; length: number }>)?.map((f) => ({
        name: f.name,
        type: f.type,
        length: f.length,
      })),
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  }

  async getTables(connection: DriverConnection, info: DatabaseConnection): Promise<TableInfo[]> {
    const conn = connection as mysql.Connection;
    let dbName = info.database?.trim();
    if (!dbName) {
      const [dbResult] = await conn.query('SELECT DATABASE() as current_db');
      dbName = (dbResult as Array<{ current_db: string }>)[0]?.current_db;
      if (!dbName) return [];
    }

    const [results] = await conn.query(
      `SELECT TABLE_NAME as name, TABLE_TYPE as type
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
       ORDER BY TABLE_NAME`,
      [dbName]
    );

    return (results as Array<{ name: string; type: string }>).map((r) => ({
      name: r.name,
      type: r.type === 'BASE TABLE' ? 'table' : r.type === 'VIEW' ? 'view' : r.type,
    }));
  }

  async getTableStructure(
    connection: DriverConnection,
    info: DatabaseConnection,
    tableName: string
  ): Promise<TableStructure> {
    const conn = connection as mysql.Connection;
    const columns: TableStructure['columns'] = [];
    let rows: number | undefined;
    const indexes: NonNullable<TableStructure['indexes']> = [];
    let primaryKeyColumns: string[] = [];

    const [fkResults] = await conn.query(
      `
      SELECT
        kcu.COLUMN_NAME AS column_name,
        kcu.REFERENCED_TABLE_NAME AS foreign_table_name,
        kcu.REFERENCED_COLUMN_NAME AS foreign_column_name
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_SCHEMA = ?
        AND kcu.TABLE_NAME = ?
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      `,
      [info.database, tableName]
    );
    const fkByColumn = new Map<string, string>();
    for (const r of fkResults as Array<Record<string, unknown>>) {
      const col = String(r.column_name || r.COLUMN_NAME || '');
      const ft = String(r.foreign_table_name || r.REFERENCED_TABLE_NAME || '');
      const fc = String(r.foreign_column_name || r.REFERENCED_COLUMN_NAME || '');
      if (col && ft && fc) fkByColumn.set(col, `${ft}.${fc}`);
    }

    const [colResults] = await conn.query(
      `SELECT ORDINAL_POSITION, COLUMN_NAME as name,
        CONCAT(DATA_TYPE, CASE WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL THEN CONCAT('(', CHARACTER_MAXIMUM_LENGTH, ')')
          WHEN NUMERIC_PRECISION IS NOT NULL AND NUMERIC_SCALE IS NOT NULL THEN CONCAT('(', NUMERIC_PRECISION, ',', NUMERIC_SCALE, ')')
          WHEN NUMERIC_PRECISION IS NOT NULL THEN CONCAT('(', NUMERIC_PRECISION, ')') ELSE '' END) as type,
        IS_NULLABLE = 'YES' as nullable, COLUMN_DEFAULT as default_value, EXTRA as extra, COLUMN_COMMENT as comment
        FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [info.database, tableName]
    );
    columns.push(
      ...(colResults as Array<Record<string, unknown>>).map((r) => ({
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
      const [countResults] = await conn.query(
        `SELECT COUNT(*) as count FROM \`${tableName}\``
      );
      rows = (countResults as Array<{ count: number }>)[0]?.count;
    } catch {
      /* ignore */
    }

    try {
      const [pkRows] = await conn.query(
        `SELECT COLUMN_NAME AS col_name
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = ?
           AND CONSTRAINT_NAME = 'PRIMARY'
         ORDER BY ORDINAL_POSITION`,
        [info.database, tableName]
      );
      primaryKeyColumns = (pkRows as Array<Record<string, unknown>>)
        .map((r) => String(r.col_name ?? r.COLUMN_NAME ?? r.name ?? ''))
        .filter(Boolean);
    } catch {
      primaryKeyColumns = [];
    }

    return { columns, rows, indexes, primaryKeyColumns };
  }

  async getDatabases(connection: DriverConnection): Promise<Array<{ name: string; tableCount?: number }>> {
    const [results] = await (connection as mysql.Connection).query('SHOW DATABASES');
    return (results as Array<{ Database: string }>).map((r) => ({
      name: r.Database,
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
    const conn = connection as mysql.Connection;
    const name = sanitizeTableIdent(table);
    if (includeStructure) {
      const [createRows] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
      const row0 = (createRows as Record<string, string>[])[0];
      const createTable = row0['Create Table'];
      const createView = row0['Create View'];
      const ddl = createTable ?? createView;
      if (!ddl) throw new Error(`SHOW CREATE TABLE failed for ${name}`);
      const drop =
        createView && !createTable
          ? `DROP VIEW IF EXISTS \`${name}\`;\n`
          : `DROP TABLE IF EXISTS \`${name}\`;\n`;
      await write(`-- Table: ${name}\n${drop}${ddl};\n\n`);
    } else {
      await write(`-- Table: ${name}\n-- (data only)\n\n`);
    }

    if (!includeData) return;
    const batch = 200;
    const [countRows] = await conn.query(`SELECT COUNT(*) as count FROM \`${name}\``);
    const total = Number((countRows as Array<Record<string, unknown>>)[0]?.count ?? 0);
    if (total === 0) return;

    let cols: string[] | undefined;
    for (let offset = 0; offset < total; offset += batch) {
      const [dataRows] = await conn.query(
        `SELECT * FROM \`${name}\` LIMIT ? OFFSET ?`,
        [batch, offset]
      );
      const rows = dataRows as Record<string, unknown>[];
      if (rows.length === 0) break;
      cols ??= Object.keys(rows[0]);
      const currentCols = cols;
      const colList = currentCols.map((c) => `\`${c}\``).join(',');
      const values = rows
        .map((r) => `(${currentCols.map((c) => mysqlLiteral(r[c])).join(',')})`)
        .join(',\n');
      await write(`INSERT INTO \`${name}\` (${colList}) VALUES\n${values};\n\n`);
      onProgress?.({ stage: 'table:batch', rowsDone: Math.min(offset + rows.length, total), rowsTotal: total });
    }
  }

  async dropTable(connection: DriverConnection, tableName: string, tableType?: string): Promise<void> {
    const name = sanitizeTableIdent(tableName);
    const isView = tableType === 'view';
    const sql = isView
      ? `DROP VIEW IF EXISTS \`${name}\``
      : `DROP TABLE IF EXISTS \`${name}\``;
    await (connection as mysql.Connection).query(sql);
  }

  async dropDatabase(
    connection: DriverConnection,
    info: DatabaseConnection,
    databaseName: string
  ): Promise<void> {
    const target = databaseName.trim();
    const lower = target.toLowerCase();
    const mysqlProtected = new Set(['mysql', 'information_schema', 'performance_schema', 'sys']);
    if (mysqlProtected.has(lower)) {
      throw new Error('Cannot drop a system database');
    }

    const conn = connection as mysql.Connection;
    const currentDb = info.database?.trim() ?? '';

    await conn.query('USE `mysql`');
    await conn.query(`DROP DATABASE ${mysqlQuoteDatabaseIdent(target)}`);

    if (currentDb && currentDb.toLowerCase() !== lower) {
      await conn.query(`USE ${mysqlQuoteDatabaseIdent(currentDb)}`);
    }
  }
}
