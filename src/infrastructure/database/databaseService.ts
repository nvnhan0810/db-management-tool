import type { DatabaseConnection } from '@/domain/connection/types';
import type { QueryResult } from '@/domain/query/types';
import { splitSqlStatements } from '@/infrastructure/database/sqlScriptSplit';
import { getPg, getSsh2Client } from '@/utils/native-modules';
import mysql from 'mysql2/promise';
import { once } from 'node:events';
import fs from 'node:fs';
import * as net from 'net';

class DatabaseService {
  private connections = new Map<string, unknown>();
  private connectionInfo = new Map<string, DatabaseConnection>();
  private sshTunnels = new Map<
    string,
    { sshClient: import('ssh2').Client; server: net.Server }
  >();

  private async createSshTunnel(connection: DatabaseConnection): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!connection.ssh?.enabled) {
        reject(new Error('SSH tunnel not enabled'));
        return;
      }

      const sshConfig = connection.ssh;
      const SshClient = getSsh2Client();
      const sshClient = new SshClient();

      const sshConnectionConfig: Record<string, unknown> = {
        host: sshConfig.host,
        port: sshConfig.port || 22,
        username: sshConfig.username,
      };

      if (sshConfig.privateKey) {
        sshConnectionConfig.privateKey = sshConfig.privateKey;
        if (sshConfig.passphrase) sshConnectionConfig.passphrase = sshConfig.passphrase;
      } else if (sshConfig.password) {
        sshConnectionConfig.password = sshConfig.password;
      } else {
        reject(new Error('SSH authentication method not provided'));
        return;
      }

      sshClient.on('ready', () => {
        const server = net.createServer((localSocket) => {
          sshClient.forwardOut(
            localSocket.remoteAddress || '127.0.0.1',
            localSocket.remotePort || 0,
            connection.host,
            connection.port,
            (err, remoteSocket) => {
              if (err) {
                localSocket.end();
                return;
              }
              localSocket.pipe(remoteSocket);
              remoteSocket.pipe(localSocket);
            }
          );
        });

        server.listen(0, '127.0.0.1', () => {
          const localPort = (server.address() as net.AddressInfo).port;
          this.sshTunnels.set(connection.id, { sshClient, server });
          resolve(localPort);
        });

        server.on('error', reject);
      });

      sshClient.on('error', reject);
      sshClient.connect(sshConnectionConfig);
    });
  }

  private async closeSshTunnel(connectionId: string): Promise<void> {
    const tunnel = this.sshTunnels.get(connectionId);
    if (tunnel) {
      try {
        tunnel.server.close();
        tunnel.sshClient.end();
      } catch (err) {
        console.error('Error closing SSH tunnel:', err);
      }
      this.sshTunnels.delete(connectionId);
    }
  }

  async connect(connection: DatabaseConnection): Promise<boolean> {
    let dbHost = connection.host;
    let dbPort = connection.port;

    if (connection.ssh?.enabled) {
      const localPort = await this.createSshTunnel(connection);
      dbHost = '127.0.0.1';
      dbPort = localPort;
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const isRetryableConnectError = (err: unknown) => {
      const anyErr = err as { code?: unknown; message?: unknown };
      const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
      const msg = typeof anyErr?.message === 'string' ? anyErr.message : '';
      return (
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        msg.includes('ECONNRESET') ||
        msg.includes('ECONNREFUSED')
      );
    };

    try {
      if (connection.type === 'mysql') {
        const conn = await mysql.createConnection({
          host: dbHost,
          port: dbPort,
          user: connection.username,
          password: connection.password,
          database: connection.database,
        });
        this.connections.set(connection.id, conn);
        this.connectionInfo.set(connection.id, connection);
      } else if (connection.type === 'postgresql') {

        const pgConfig: Record<string, unknown> = {
          host: dbHost,
          port: dbPort,
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
              throw err;
            }
            await sleep(250 * attempt);
          }
        }
        if (lastErr) throw lastErr;

        this.connections.set(connection.id, pgPool);
        this.connectionInfo.set(connection.id, connection);
      } else {
        throw new Error(`Unsupported database type: ${connection.type}`);
      }
      return true;
    } catch (error) {
      if (connection.ssh?.enabled) {
        await this.closeSshTunnel(connection.id);
      }
      throw error;
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId) as
      | { end?: () => Promise<void>; close?: () => Promise<void> }
      | undefined;
    if (connection) {
      if (connection.end) await connection.end();
      else if (connection.close) await connection.close();
      this.connections.delete(connectionId);
      this.connectionInfo.delete(connectionId);
    }
    await this.closeSshTunnel(connectionId);
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.connections.keys());
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  hasActiveConnections(): boolean {
    return this.connections.size > 0;
  }

  async query(connectionId: string, query: string): Promise<QueryResult> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection) throw new Error('No active connection found');
    if (!info) throw new Error('No connection info found');

    try {
      let results: unknown;
      let fields: unknown;

      if (info.type === 'postgresql') {
        const pgPool = connection as import('pg').Pool;
        const result = await pgPool.query(query);
        results = result.rows;
        fields = result.fields?.map((f: import('pg').FieldDef) => ({
          name: f.name,
          type: f.dataTypeID,
          length: f.dataTypeSize,
        }));
      } else if (info.type === 'mysql') {
        const mysqlConn = connection as mysql.Connection;
        const [rows, cols] = await mysqlConn.query(query);
        results = rows;
        fields = cols;
      } else {
        throw new Error('Unsupported connection type');
      }

      return {
        success: true,
        data: results as unknown[],
        fields: fields as unknown[],
        rowCount: Array.isArray(results) ? results.length : 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getTables(connectionId: string): Promise<Array<{ name: string; type?: string }>> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection || !info) return [];

    try {
      if (info.type === 'postgresql') {
        const pgPool = connection as import('pg').Pool;
        const result = await pgPool.query(`
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
    } catch {
      return [];
    }
  }

  async getTableStructure(
    connectionId: string,
    tableName: string
  ): Promise<{
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      ordinal_position?: number;
      character_set?: string;
      collation?: string;
      default_value?: string;
      extra?: string;
      foreign_key?: string;
      comment?: string;
    }>;
    rows?: number;
    indexes?: Array<{ name: string; algorithm?: string; is_unique: boolean; column_name: string }>;
  }> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection || !info) throw new Error('No active connection found');

    const columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      ordinal_position?: number;
      character_set?: string;
      collation?: string;
      default_value?: string;
      extra?: string;
      foreign_key?: string;
      comment?: string;
    }> = [];
    let rows: number | undefined;
    const indexes: Array<{
      name: string;
      algorithm?: string;
      is_unique: boolean;
      column_name: string;
    }> = [];

    if (info.type === 'postgresql') {
      const pgPool = connection as import('pg').Pool;
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
          `SELECT COUNT(*) as count FROM "${tableName}"`
        );
        rows = parseInt(String(countResult.rows[0]?.count || 0), 10);
      } catch {
        /* ignore */
      }
    } else {
      const conn = connection as mysql.Connection;
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
    }

    return { columns, rows, indexes };
  }

  async getDatabases(
    connectionId: string
  ): Promise<Array<{ name: string; tableCount?: number }>> {
    const connection = this.connections.get(connectionId);
    if (!connection) return [];
    const info = this.connectionInfo.get(connectionId);
    if (!info) return [];

    try {
      if (info.type === 'postgresql') {
        const pgPool = connection as import('pg').Pool;
        const result = await pgPool.query(
          `SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY datname`
        );
        return (result.rows as Array<{ name: string }>).map((r) => ({
          name: r.name,
          tableCount: 0,
        }));
      }

      const conn = connection as mysql.Connection;
      const [results] = await conn.query('SHOW DATABASES');
      return (results as Array<{ Database: string }>).map((r) => ({
        name: r.Database,
        tableCount: 0,
      }));
    } catch {
      return [];
    }
  }

  async executeQuery(connectionId: string, query: string): Promise<QueryResult> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error('No active connection found');
    const info = this.connectionInfo.get(connectionId);
    if (!info) throw new Error('No connection info found');

    if (info.type === 'postgresql') {
      const pgPool = connection as import('pg').Pool;
      const result = await pgPool.query(query);
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

    const conn = connection as mysql.Connection;
    const [rows, fields] = await conn.query(query);
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

  /**
   * Export selected tables as SQL (DDL + INSERT). Table names must match [a-zA-Z0-9_].
   */
  async exportTablesSql(
    connectionId: string,
    tableNames: string[],
    onProgress?: (p: {
      stage:
        | 'table:start'
        | 'table:done'
        | 'table:batch'
        | 'start';
      table?: string;
      tableIndex?: number;
      totalTables?: number;
      rowsDone?: number;
      rowsTotal?: number;
    }) => void
  ): Promise<string> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection || !info) throw new Error('No active connection found');
    if (!tableNames.length) throw new Error('No tables selected');
    const dbLabel = info.database ?? 'database';
    const header = `-- GL Database Client export\n-- ${dbLabel}\n-- ${new Date().toISOString()}\n\n`;
    const parts: string[] = [header];
    onProgress?.({ stage: 'start', totalTables: tableNames.length });
    for (let i = 0; i < tableNames.length; i++) {
      const raw = tableNames[i];
      const name = sanitizeTableIdent(raw);
      onProgress?.({ stage: 'table:start', table: name, tableIndex: i + 1, totalTables: tableNames.length });
      if (info.type === 'postgresql') {
        parts.push(
          await this.exportPgTable(connection as import('pg').Pool, name, (p) =>
            onProgress?.({ ...p, table: name, tableIndex: i + 1, totalTables: tableNames.length })
          )
        );
      } else {
        parts.push(
          await this.exportMysqlTable(connection as mysql.Connection, name, (p) =>
            onProgress?.({ ...p, table: name, tableIndex: i + 1, totalTables: tableNames.length })
          )
        );
      }
      onProgress?.({ stage: 'table:done', table: name, tableIndex: i + 1, totalTables: tableNames.length });
    }
    return parts.join('\n');
  }

  /**
   * Stream export directly to a file (avoids huge in-memory string).
   */
  async exportTablesSqlToPath(
    connectionId: string,
    tableNames: string[],
    outPath: string,
    onProgress?: (p: {
      stage:
        | 'table:start'
        | 'table:done'
        | 'table:batch'
        | 'start';
      table?: string;
      tableIndex?: number;
      totalTables?: number;
      rowsDone?: number;
      rowsTotal?: number;
    }) => void
  , signal?: AbortSignal,
  mode: 'structure-data' | 'structure' | 'data' = 'structure-data'
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection || !info) throw new Error('No active connection found');
    if (!tableNames.length) throw new Error('No tables selected');

    const stream = fs.createWriteStream(outPath, { encoding: 'utf8' });
    const write = async (chunk: string) => {
      if (!stream.write(chunk)) {
        await once(stream, 'drain');
      }
    };

    const dbLabel = info.database ?? 'database';
    await write(`-- GL Database Client export\n-- ${dbLabel}\n-- mode=${mode}\n-- ${new Date().toISOString()}\n\n`);

    onProgress?.({ stage: 'start', totalTables: tableNames.length });
    try {
      for (let i = 0; i < tableNames.length; i++) {
        if (signal?.aborted) throw new Error('Export canceled');
        const name = sanitizeTableIdent(tableNames[i]);
      onProgress?.({
        stage: 'table:start',
        table: name,
        tableIndex: i + 1,
        totalTables: tableNames.length,
      });

      const includeStructure = mode === 'structure-data' || mode === 'structure';
      const includeData = mode === 'structure-data' || mode === 'data';

      if (info.type === 'postgresql') {
        await this.exportPgTableToWriter(connection as import('pg').Pool, name, write, includeStructure, includeData, (p) =>
          onProgress?.({ ...p, table: name, tableIndex: i + 1, totalTables: tableNames.length })
        );
      } else {
        await this.exportMysqlTableToWriter(connection as mysql.Connection, name, write, includeStructure, includeData, (p) =>
          onProgress?.({ ...p, table: name, tableIndex: i + 1, totalTables: tableNames.length })
        );
      }

      onProgress?.({
        stage: 'table:done',
        table: name,
        tableIndex: i + 1,
        totalTables: tableNames.length,
      });
      }
    } catch (err) {
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(outPath);
      } catch {
        /* ignore */
      }
      throw err;
    }

    await new Promise<void>((resolve, reject) => {
      stream.end(() => resolve());
      stream.on('error', reject);
    });
  }

  private async exportMysqlTable(
    conn: mysql.Connection,
    table: string,
    onProgress?: (p: { stage: 'table:batch'; rowsDone: number; rowsTotal: number }) => void
  ): Promise<string> {
    const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    const row0 = (createRows as Record<string, string>[])[0];
    const createTable = row0['Create Table'];
    const createView = row0['Create View'];
    const ddl = createTable ?? createView;
    if (!ddl) throw new Error(`SHOW CREATE TABLE failed for ${table}`);
    const drop =
      createView && !createTable
        ? `DROP VIEW IF EXISTS \`${table}\`;\n`
        : `DROP TABLE IF EXISTS \`${table}\`;\n`;
    let out = `-- Table: ${table}\n${drop}${ddl};\n\n`;
    const [dataRows] = await conn.query(`SELECT * FROM \`${table}\``);
    const rows = dataRows as Record<string, unknown>[];
    if (rows.length === 0) return out;
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `\`${c}\``).join(',');
    const batch = 200;
    const total = rows.length;
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const values = chunk
        .map((r) => `(${cols.map((c) => mysqlLiteral(r[c])).join(',')})`)
        .join(',\n');
      out += `INSERT INTO \`${table}\` (${colList}) VALUES\n${values};\n\n`;
      onProgress?.({ stage: 'table:batch', rowsDone: Math.min(i + chunk.length, total), rowsTotal: total });
    }
    return out;
  }

  private async exportMysqlTableToWriter(
    conn: mysql.Connection,
    table: string,
    write: (chunk: string) => Promise<void>,
    includeStructure: boolean,
    includeData: boolean,
    onProgress?: (p: { stage: 'table:batch'; rowsDone: number; rowsTotal: number }) => void
  ): Promise<void> {
    if (includeStructure) {
      const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      const row0 = (createRows as Record<string, string>[])[0];
      const createTable = row0['Create Table'];
      const createView = row0['Create View'];
      const ddl = createTable ?? createView;
      if (!ddl) throw new Error(`SHOW CREATE TABLE failed for ${table}`);
      const drop =
        createView && !createTable
          ? `DROP VIEW IF EXISTS \`${table}\`;\n`
          : `DROP TABLE IF EXISTS \`${table}\`;\n`;
      await write(`-- Table: ${table}\n${drop}${ddl};\n\n`);
    } else {
      await write(`-- Table: ${table}\n-- (data only)\n\n`);
    }

    if (!includeData) return;
    const [dataRows] = await conn.query(`SELECT * FROM \`${table}\``);
    const rows = dataRows as Record<string, unknown>[];
    if (rows.length === 0) return;

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `\`${c}\``).join(',');
    const batch = 200;
    const total = rows.length;
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const values = chunk
        .map((r) => `(${cols.map((c) => mysqlLiteral(r[c])).join(',')})`)
        .join(',\n');
      await write(`INSERT INTO \`${table}\` (${colList}) VALUES\n${values};\n\n`);
      onProgress?.({ stage: 'table:batch', rowsDone: Math.min(i + chunk.length, total), rowsTotal: total });
    }
  }

  private async exportPgTable(
    pool: import('pg').Pool,
    table: string,
    onProgress?: (p: { stage: 'table:batch'; rowsDone: number; rowsTotal: number }) => void
  ): Promise<string> {
    const qTable = pgQuoteIdent(table);
    const vCheck = await pool.query(
      `SELECT view_definition FROM information_schema.views WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (vCheck.rows.length > 0) {
      const def = (vCheck.rows[0] as { view_definition: string }).view_definition;
      return `-- View: ${table}\nDROP VIEW IF EXISTS ${qTable} CASCADE;\nCREATE OR REPLACE VIEW ${qTable} AS ${def};\n\n`;
    }

    const ddlResult = await pool.query(
      `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS typ
       FROM pg_attribute a
       JOIN pg_class c ON a.attrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`,
      [table]
    );
    const colRows = ddlResult.rows as Array<{ name: string; typ: string }>;
    if (colRows.length === 0) throw new Error(`Table not found: ${table}`);
    const colDefs = colRows.map((r) => `${pgQuoteIdent(r.name)} ${r.typ}`).join(',\n  ');
    let out = `-- Table: ${table}\nDROP TABLE IF EXISTS ${qTable} CASCADE;\nCREATE TABLE ${qTable} (\n  ${colDefs}\n);\n\n`;
    const dataResult = await pool.query(`SELECT * FROM ${qTable}`);
    const rows = dataResult.rows as Record<string, unknown>[];
    if (rows.length === 0) return out;
    const cols = Object.keys(rows[0]);
    const colList = cols.map(pgQuoteIdent).join(',');
    const batch = 200;
    const total = rows.length;
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const values = chunk
        .map((r) => `(${cols.map((c) => pgLiteral(r[c])).join(',')})`)
        .join(',\n');
      out += `INSERT INTO ${qTable} (${colList}) VALUES\n${values};\n\n`;
      onProgress?.({ stage: 'table:batch', rowsDone: Math.min(i + chunk.length, total), rowsTotal: total });
    }
    return out;
  }

  private async exportPgTableToWriter(
    pool: import('pg').Pool,
    table: string,
    write: (chunk: string) => Promise<void>,
    includeStructure: boolean,
    includeData: boolean,
    onProgress?: (p: { stage: 'table:batch'; rowsDone: number; rowsTotal: number }) => void
  ): Promise<void> {
    const qTable = pgQuoteIdent(table);
    const vCheck = await pool.query(
      `SELECT view_definition FROM information_schema.views WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (vCheck.rows.length > 0) {
      const def = (vCheck.rows[0] as { view_definition: string }).view_definition;
      if (includeStructure) {
        await write(
          `-- View: ${table}\nDROP VIEW IF EXISTS ${qTable} CASCADE;\nCREATE OR REPLACE VIEW ${qTable} AS ${def};\n\n`
        );
      } else {
        await write(`-- View: ${table}\n-- (data only; views have no data)\n\n`);
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
        [table]
      );
      const colRows = ddlResult.rows as Array<{ name: string; typ: string }>;
      if (colRows.length === 0) throw new Error(`Table not found: ${table}`);
      const colDefs = colRows.map((r) => `${pgQuoteIdent(r.name)} ${r.typ}`).join(',\n  ');
      await write(
        `-- Table: ${table}\nDROP TABLE IF EXISTS ${qTable} CASCADE;\nCREATE TABLE ${qTable} (\n  ${colDefs}\n);\n\n`
      );
    } else {
      await write(`-- Table: ${table}\n-- (data only)\n\n`);
    }

    if (!includeData) return;
    const dataResult = await pool.query(`SELECT * FROM ${qTable}`);
    const rows = dataResult.rows as Record<string, unknown>[];
    if (rows.length === 0) return;

    const cols = Object.keys(rows[0]);
    const colList = cols.map(pgQuoteIdent).join(',');
    const batch = 200;
    const total = rows.length;
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const values = chunk
        .map((r) => `(${cols.map((c) => pgLiteral(r[c])).join(',')})`)
        .join(',\n');
      await write(`INSERT INTO ${qTable} (${colList}) VALUES\n${values};\n\n`);
      onProgress?.({ stage: 'table:batch', rowsDone: Math.min(i + chunk.length, total), rowsTotal: total });
    }
  }

  /**
   * Run SQL script (one statement at a time). Best for files produced by this app.
   */
  async importSqlScript(
    connectionId: string,
    sql: string
  ): Promise<{ success: boolean; executed: number; error?: string }> {
    const statements = splitSqlStatements(sql);
    let executed = 0;
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      try {
        await this.executeQuery(connectionId, trimmed);
        executed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, executed, error: msg };
      }
    }
    return { success: true, executed };
  }

  /**
   * Import SQL by streaming a file on disk (avoids crashing on huge IPC payloads).
   * Supports the same subset as our exporter: split on `;` outside single quotes.
   */
  async importSqlFromPath(
    connectionId: string,
    filePath: string,
    onProgress?: (p: {
      stage: 'scan' | 'read' | 'execute';
      bytesRead: number;
      totalBytes: number;
      executed: number;
      totalStatements?: number;
    }) => void,
    signal?: AbortSignal
  ): Promise<{ executed: number; totalBytes: number }> {
    const st = fs.statSync(filePath);
    const totalBytes = st.size;

    let bytesRead = 0;
    let executed = 0;

    const flushStatement = async (stmt: string, totalStatements?: number) => {
      const trimmed = stmt.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('--')) return;
      if (signal?.aborted) throw new Error('Import canceled');
      onProgress?.({ stage: 'execute', bytesRead, totalBytes, executed, totalStatements });
      await this.executeQuery(connectionId, trimmed);
      executed++;
    };

    const countStatements = async (): Promise<number> => {
      const scanStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let scanBytesRead = 0;
      let buf = '';
      let inSingle = false;
      let totalStatements = 0;

      const countMaybe = (stmt: string) => {
        const trimmed = stmt.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('--')) return;
        totalStatements++;
      };

      for await (const chunk of scanStream as AsyncIterable<string>) {
        if (signal?.aborted) throw new Error('Import canceled');
        scanBytesRead += Buffer.byteLength(chunk, 'utf8');

        for (let i = 0; i < chunk.length; i++) {
          const c = chunk[i];
          if (c === "'" && chunk[i + 1] === "'") {
            buf += "''";
            i++;
            continue;
          }
          if (c === "'") {
            inSingle = !inSingle;
            buf += c;
            continue;
          }
          if (!inSingle && c === ';') {
            const stmt = buf;
            buf = '';
            countMaybe(stmt);
            continue;
          }
          buf += c;
        }

        onProgress?.({
          stage: 'scan',
          bytesRead: scanBytesRead,
          totalBytes,
          executed,
          totalStatements,
        });
      }

      countMaybe(buf);
      return totalStatements;
    };

    const totalStatements = await countStatements();

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    bytesRead = 0;
    executed = 0;
    let buf = '';
    let inSingle = false;

    for await (const chunk of stream as AsyncIterable<string>) {
      if (signal?.aborted) throw new Error('Import canceled');
      bytesRead += Buffer.byteLength(chunk, 'utf8');

      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (c === "'" && chunk[i + 1] === "'") {
          buf += "''";
          i++;
          continue;
        }
        if (c === "'") {
          inSingle = !inSingle;
          buf += c;
          continue;
        }
        if (!inSingle && c === ';') {
          const stmt = buf;
          buf = '';
          await flushStatement(stmt, totalStatements);
          continue;
        }
        buf += c;
      }

      onProgress?.({ stage: 'read', bytesRead, totalBytes, executed, totalStatements });
    }

    // last statement without trailing semicolon
    await flushStatement(buf, totalStatements);
    return { executed, totalBytes };
  }

  async dropTable(connectionId: string, tableName: string, tableType?: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection || !info) throw new Error('No active connection found');
    const name = sanitizeTableIdent(tableName);
    const isView = tableType === 'view';

    if (info.type === 'postgresql') {
      const pgPool = connection as import('pg').Pool;
      const ident = pgQuoteIdent(name);
      const sql = isView
        ? `DROP VIEW IF EXISTS ${ident} CASCADE`
        : `DROP TABLE IF EXISTS ${ident} CASCADE`;
      await pgPool.query(sql);
      return;
    }

    const conn = connection as mysql.Connection;
    const sql = isView
      ? `DROP VIEW IF EXISTS \`${name}\``
      : `DROP TABLE IF EXISTS \`${name}\``;
    await conn.query(sql);
  }
}

function sanitizeTableIdent(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}

function pgQuoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function pgLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'::bytea`;
  if (v instanceof Date) return `'${v.toISOString()}'::timestamp with time zone`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function mysqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (v instanceof Date) return `'${formatMysqlDate(v)}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function formatMysqlDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const databaseService = new DatabaseService();
