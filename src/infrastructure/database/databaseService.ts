import type { DatabaseConnection } from '@/domain/connection/types';
import type { QueryResult } from '@/domain/query/types';
import {
  hasExecutableSql,
  splitSqlStatements,
} from '@/infrastructure/database/sqlScriptSplit';
import { MysqlDatabaseDriver } from '@/infrastructure/database/drivers/MysqlDatabaseDriver';
import { PostgresDatabaseDriver } from '@/infrastructure/database/drivers/PostgresDatabaseDriver';
import { sanitizeTableIdent } from '@/infrastructure/database/drivers/sqlFormat';
import type {
  DatabaseDriver,
  DriverConnection,
  ExportProgress,
} from '@/infrastructure/database/drivers/types';
import { getSsh2Client } from '@/utils/native-modules';
import { once } from 'node:events';
import fs from 'node:fs';
import * as net from 'net';

type ExportStage =
  | 'table:start'
  | 'table:done'
  | 'table:batch'
  | 'start';

type ExportProgressEvent = {
  stage: ExportStage;
  table?: string;
  tableIndex?: number;
  totalTables?: number;
  rowsDone?: number;
  rowsTotal?: number;
};

class DatabaseService {
  private connections = new Map<string, DriverConnection>();
  private connectionInfo = new Map<string, DatabaseConnection>();
  private connectionDrivers = new Map<string, DatabaseDriver>();
  private readonly drivers: Record<'mysql' | 'postgresql', DatabaseDriver> = {
    mysql: new MysqlDatabaseDriver(),
    postgresql: new PostgresDatabaseDriver(),
  };
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

  private getDriver(type: DatabaseConnection['type']): DatabaseDriver {
    if (type !== 'mysql' && type !== 'postgresql') {
      throw new Error(`Unsupported database type: ${type}`);
    }
    return this.drivers[type];
  }

  private getActiveConnection(connectionId: string): {
    connection: DriverConnection;
    info: DatabaseConnection;
    driver: DatabaseDriver;
  } {
    const connection = this.connections.get(connectionId);
    const info = this.connectionInfo.get(connectionId);
    const driver = this.connectionDrivers.get(connectionId);
    if (!connection) throw new Error('No active connection found');
    if (!info) throw new Error('No connection info found');
    if (!driver) throw new Error('No connection driver found');
    return { connection, info, driver };
  }

  async connect(connection: DatabaseConnection): Promise<boolean> {
    if (this.connections.has(connection.id) || this.sshTunnels.has(connection.id)) {
      await this.disconnect(connection.id);
    }

    let dbHost = connection.host;
    let dbPort = connection.port;

    if (connection.ssh?.enabled) {
      const localPort = await this.createSshTunnel(connection);
      dbHost = '127.0.0.1';
      dbPort = localPort;
    }

    try {
      const driver = this.getDriver(connection.type);
      const driverConnection = await driver.connect(connection, dbHost, dbPort);
      this.connections.set(connection.id, driverConnection);
      this.connectionInfo.set(connection.id, connection);
      this.connectionDrivers.set(connection.id, driver);
      return true;
    } catch (error) {
      if (connection.ssh?.enabled) {
        await this.closeSshTunnel(connection.id);
      }
      throw error;
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    const driver = this.connectionDrivers.get(connectionId);
    if (connection && driver) {
      await driver.disconnect(connection);
      this.connections.delete(connectionId);
      this.connectionInfo.delete(connectionId);
      this.connectionDrivers.delete(connectionId);
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
    const { connection, driver } = this.getActiveConnection(connectionId);
    try {
      return await driver.query(connection, query);
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
    const driver = this.connectionDrivers.get(connectionId);
    if (!connection || !info || !driver) return [];

    try {
      return await driver.getTables(connection, info);
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
    /** Ordered PRIMARY KEY column names (empty if no PK). */
    primaryKeyColumns?: string[];
  }> {
    const { connection, info, driver } = this.getActiveConnection(connectionId);
    return driver.getTableStructure(connection, info, tableName);
  }

  async getDatabases(
    connectionId: string
  ): Promise<Array<{ name: string; tableCount?: number }>> {
    const connection = this.connections.get(connectionId);
    const driver = this.connectionDrivers.get(connectionId);
    if (!connection || !driver) return [];

    try {
      return await driver.getDatabases(connection);
    } catch {
      return [];
    }
  }

  async executeQuery(connectionId: string, query: string): Promise<QueryResult> {
    const { connection, driver } = this.getActiveConnection(connectionId);
    return driver.executeQuery(connection, query);
  }

  /**
   * Export selected tables as SQL (DDL + INSERT). Table names must match [a-zA-Z0-9_].
   */
  async exportTablesSql(
    connectionId: string,
    tableNames: string[],
    onProgress?: (p: ExportProgressEvent) => void
  ): Promise<string> {
    const { connection, info, driver } = this.getActiveConnection(connectionId);
    if (!tableNames.length) throw new Error('No tables selected');
    const dbLabel = info.database ?? 'database';
    const header = `-- GL Database Client export\n-- ${dbLabel}\n-- ${new Date().toISOString()}\n\n`;
    const parts: string[] = [header];
    onProgress?.({ stage: 'start', totalTables: tableNames.length });
    for (let i = 0; i < tableNames.length; i++) {
      const name = sanitizeTableIdent(tableNames[i]);
      onProgress?.({ stage: 'table:start', table: name, tableIndex: i + 1, totalTables: tableNames.length });
      parts.push(
        await driver.exportTableSql(connection, name, (p) =>
          this.emitTableProgress(onProgress, p, name, i + 1, tableNames.length)
        )
      );
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
    onProgress?: (p: ExportProgressEvent) => void,
    signal?: AbortSignal,
    mode: 'structure-data' | 'structure' | 'data' = 'structure-data'
  ): Promise<void> {
    const { connection, info, driver } = this.getActiveConnection(connectionId);
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

        await driver.exportTableSqlToWriter(
          connection,
          name,
          write,
          includeStructure,
          includeData,
          (p) => this.emitTableProgress(onProgress, p, name, i + 1, tableNames.length)
        );

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
      if (!hasExecutableSql(trimmed)) return;
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
        if (!hasExecutableSql(trimmed)) return;
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
    const { connection, driver } = this.getActiveConnection(connectionId);
    await driver.dropTable(connection, tableName, tableType);
  }

  /**
   * Drop a database (MySQL / PostgreSQL). Caller must confirm (e.g. typed name) in the UI.
   */
  async dropDatabase(connectionId: string, databaseName: string): Promise<void> {
    const { connection, info, driver } = this.getActiveConnection(connectionId);
    const target = databaseName.trim();
    if (!target) throw new Error('Database name is required');

    await driver.dropDatabase(connection, info, target);

    if (info.type === 'postgresql' && info.database?.trim() === target) {
      await this.disconnect(connectionId);
    }
  }

  private emitTableProgress(
    onProgress: ((p: ExportProgressEvent) => void) | undefined,
    progress: ExportProgress,
    table: string,
    tableIndex: number,
    totalTables: number
  ): void {
    onProgress?.({ ...progress, table, tableIndex, totalTables });
  }
}

export const databaseService = new DatabaseService();
