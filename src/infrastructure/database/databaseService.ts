import type { DatabaseConnection } from '@/domain/connection/types';
import type { QueryResult } from '@/domain/query/types';
import { getSsh2Client } from '@/utils/native-modules';
import * as net from 'net';

// Lazy-load to avoid "Cannot access before initialization" with externalized modules
const getMysql = () => require('mysql2/promise');
const getPg = () => require('pg');

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

    try {
      if (connection.type === 'mysql') {
        const mysql = getMysql();
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
        const { Pool } = getPg();
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
        const pgPool = new Pool(pgConfig as import('pg').PoolConfig);
        const client = await pgPool.connect();
        try {
          await client.query('SELECT NOW()');
        } finally {
          client.release();
        }
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
    if (!connection) throw new Error('No active connection found');

    const { Pool } = getPg();

    try {
      let results: unknown;
      let fields: unknown;

      if (connection instanceof Pool) {
        const result = await connection.query(query);
        results = result.rows;
        fields = result.fields?.map((f) => ({
          name: f.name,
          type: f.dataTypeID,
          length: f.dataTypeSize,
        }));
      } else if (
        connection &&
        typeof (connection as { query?: unknown }).query === 'function'
      ) {
        const [rows, cols] = await (connection as { query: (q: string) => Promise<unknown[]> }).query(query);
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

    const { Pool } = getPg();

    try {
      if (connection instanceof Pool) {
        const result = await connection.query(`
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

      const conn = connection as { query: (q: string, ...args: unknown[]) => Promise<unknown> };
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
      comment?: string;
    }>;
    rows?: number;
    indexes?: Array<{ name: string; algorithm?: string; is_unique: boolean; column_name: string }>;
  }> {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    if (!connection || !info) throw new Error('No active connection found');

    const { Pool } = getPg();

    const columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      ordinal_position?: number;
      character_set?: string;
      collation?: string;
      default_value?: string;
      extra?: string;
      comment?: string;
    }> = [];
    let rows: number | undefined;
    const indexes: Array<{
      name: string;
      algorithm?: string;
      is_unique: boolean;
      column_name: string;
    }> = [];

    if (connection instanceof Pool) {
      const colResult = await connection.query(
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
          comment: r.comment as string,
        }))
      );
      try {
        const countResult = await connection.query(
          `SELECT COUNT(*) as count FROM "${tableName}"`
        );
        rows = parseInt(String(countResult.rows[0]?.count || 0), 10);
      } catch {
        /* ignore */
      }
    } else {
      const conn = connection as { query: (q: string, ...args: unknown[]) => Promise<unknown> };
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

    const { Pool } = getPg();

    try {
      if (connection instanceof Pool) {
        const result = await connection.query(
          `SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY datname`
        );
        return (result.rows as Array<{ name: string }>).map((r) => ({
          name: r.name,
          tableCount: 0,
        }));
      }

      const conn = connection as { query: (q: string, ...args: unknown[]) => Promise<unknown> };
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

    const { Pool } = getPg();

    if (connection instanceof Pool) {
      const result = await connection.query(query);
      return {
        success: true,
        data: result.rows,
        fields: result.fields?.map((f) => ({
          name: f.name,
          type: f.dataTypeID,
          length: f.dataTypeSize,
        })),
        rowCount: result.rowCount ?? 0,
      };
    }

    const conn = connection as { query: (q: string) => Promise<[unknown, unknown]> };
    const [rows, fields] = await conn.query(query);
    return {
      success: true,
      data: rows as unknown[],
      fields: (fields as unknown[])?.map((f: { name: string; type: number; length: number }) => ({
        name: f.name,
        type: f.type,
        length: f.length,
      })),
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  }
}

export const databaseService = new DatabaseService();
