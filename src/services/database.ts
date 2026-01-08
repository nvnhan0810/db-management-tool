import type { DatabaseConnection } from '@/types/connection';
import type { QueryResult } from '@/types/query';
import mysql from 'mysql2/promise';
import * as net from 'net';
import { Pool } from 'pg';
import { Client as SshClient } from 'ssh2';

class DatabaseService {
  private connections: Map<string, any> = new Map();
  private connectionInfo: Map<string, DatabaseConnection> = new Map();
  private sshTunnels: Map<string, { sshClient: SshClient; server: net.Server }> = new Map();

  private async createSshTunnel(connection: DatabaseConnection): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!connection.ssh?.enabled) {
        reject(new Error('SSH tunnel not enabled'));
        return;
      }

      const sshConfig = connection.ssh;
      const sshClient = new SshClient();

      // SSH connection config
      const sshConnectionConfig: any = {
        host: sshConfig.host,
        port: sshConfig.port || 22,
        username: sshConfig.username,
      };

      // Authentication method
      if (sshConfig.privateKey) {
        sshConnectionConfig.privateKey = sshConfig.privateKey;
        if (sshConfig.passphrase) {
          sshConnectionConfig.passphrase = sshConfig.passphrase;
        }
      } else if (sshConfig.password) {
        sshConnectionConfig.password = sshConfig.password;
      } else {
        reject(new Error('SSH authentication method not provided (password or private key required)'));
        return;
      }

      sshClient.on('ready', () => {
        console.log('SSH Client ready');

        // Create local server that forwards to remote database
        const server = net.createServer((localSocket) => {
          sshClient.forwardOut(
            localSocket.remoteAddress || '127.0.0.1',
            localSocket.remotePort || 0,
            connection.host,
            connection.port,
            (err, remoteSocket) => {
              if (err) {
                console.error('SSH forward error:', err);
                localSocket.end();
                return;
              }

              localSocket.pipe(remoteSocket);
              remoteSocket.pipe(localSocket);
            }
          );
        });

        // Find available port
        server.listen(0, '127.0.0.1', () => {
          const localPort = (server.address() as net.AddressInfo).port;
          console.log(`SSH tunnel established: localhost:${localPort} -> ${connection.host}:${connection.port} via ${sshConfig.host}`);

          // Store tunnel for cleanup
          this.sshTunnels.set(connection.id, { sshClient, server });

          resolve(localPort);
        });

        server.on('error', (err) => {
          console.error('SSH tunnel server error:', err);
          reject(err);
        });
      });

      sshClient.on('error', (err) => {
        console.error('SSH Client error:', err);
        reject(err);
      });

      sshClient.connect(sshConnectionConfig);
    });
  }

  async connect(connection: DatabaseConnection): Promise<boolean> {
    try {
      console.log('Connecting to database:', {
        ...connection,
        password: connection.password ? '***' : undefined,
        ssh: connection.ssh ? {
          ...connection.ssh,
          password: connection.ssh.password ? '***' : undefined,
          privateKey: connection.ssh.privateKey ? '***' : undefined,
          passphrase: connection.ssh.passphrase ? '***' : undefined,
        } : undefined,
      });

      let dbHost = connection.host;
      let dbPort = connection.port;

      // Create SSH tunnel if enabled
      if (connection.ssh?.enabled) {
        console.log('Creating SSH tunnel...', {
          sshHost: connection.ssh.host,
          sshPort: connection.ssh.port,
          sshUsername: connection.ssh.username,
          dbHost: connection.host,
          dbPort: connection.port,
        });
        const localPort = await this.createSshTunnel(connection);
        dbHost = '127.0.0.1';
        dbPort = localPort;
        console.log(`Using SSH tunnel: ${dbHost}:${dbPort} -> ${connection.host}:${connection.port}`);
      }

      switch (connection.type) {
        case 'mysql':
          const mysqlConnection = await mysql.createConnection({
            host: dbHost,
            port: dbPort,
            user: connection.username,
            password: connection.password,
            database: connection.database,
          });

          this.connections.set(connection.id, mysqlConnection);
          this.connectionInfo.set(connection.id, connection);
          break;

        case 'postgresql':
          // PostgreSQL connection config
          const pgConfig: any = {
            host: dbHost,
            port: dbPort,
            user: connection.username, // Database username, not SSH username
            password: connection.password, // Database password, not SSH password
          };

          // Only add database if it's provided and not empty
          if (connection.database && connection.database.trim()) {
            pgConfig.database = connection.database.trim();
          }

          // Add connection timeout
          pgConfig.connectionTimeoutMillis = 10000; // 10 seconds

          console.log('PostgreSQL config:', {
            host: pgConfig.host,
            port: pgConfig.port,
            user: pgConfig.user,
            database: pgConfig.database,
            hasPassword: !!pgConfig.password,
          });

          const pgPool = new Pool(pgConfig);

          // Test the connection with a simple query
          const client = await pgPool.connect();
          try {
            await client.query('SELECT NOW()');
            console.log('PostgreSQL connection test successful');
          } finally {
            client.release();
          }

          this.connections.set(connection.id, pgPool);
          this.connectionInfo.set(connection.id, connection);
          break;

        // case 'sqlite':
        //   const sqliteDb = new sqlite3.Database(connection.database);
        //   this.connections.set(connection.id, sqliteDb);
        //   this.connectionInfo.set(connection.id, connection);
        //   break;

        default:
          throw new Error(`Unsupported database type: ${connection.type}`);
      }

      return true;
    } catch (error) {
      console.error('Database connection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown database connection error';
      console.error('Error details:', errorMessage);

      // Clean up SSH tunnel if connection failed
      if (connection.ssh?.enabled) {
        await this.closeSshTunnel(connection.id);
      }

      throw new Error(errorMessage);
    }
  }

  private async closeSshTunnel(connectionId: string): Promise<void> {
    const tunnel = this.sshTunnels.get(connectionId);
    if (tunnel) {
      try {
        tunnel.server.close();
        tunnel.sshClient.end();
        console.log(`SSH tunnel closed for connection ${connectionId}`);
      } catch (err) {
        console.error('Error closing SSH tunnel:', err);
      }
      this.sshTunnels.delete(connectionId);
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      if (connection.end) {
        await connection.end();
      } else if (connection.close) {
        await connection.close();
      }
      this.connections.delete(connectionId);
      this.connectionInfo.delete(connectionId);
    }

    // Close SSH tunnel if exists
    await this.closeSshTunnel(connectionId);
  }

  async disconnectAll(): Promise<void> {
    const connectionIds = Array.from(this.connections.keys());
    const disconnectPromises = connectionIds.map(connectionId => this.disconnect(connectionId));

    try {
      await Promise.all(disconnectPromises);
      console.log(`Disconnected ${connectionIds.length} active connections`);
    } catch (error) {
      console.error('Error disconnecting all connections:', error);
    }

    // Close all SSH tunnels
    const tunnelIds = Array.from(this.sshTunnels.keys());
    for (const tunnelId of tunnelIds) {
      await this.closeSshTunnel(tunnelId);
    }
  }

  hasActiveConnections(): boolean {
    return this.connections.size > 0;
  }

  async query(connectionId: string, query: string): Promise<QueryResult> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('No active connection found');
    }

    try {
      let results: any;
      let fields: any;

      if (connection instanceof Pool) {
        // PostgreSQL
        const result = await connection.query(query);
        results = result.rows;
        fields = result.fields?.map(field => ({
          name: field.name,
          type: field.dataTypeID,
          length: field.dataTypeSize
        }));
      } else if (connection.query && typeof connection.query === 'function') {
        // MySQL
        [results, fields] = await connection.query(query);
      } else if (connection.all) {
        // SQLite
        results = await new Promise((resolve, reject) => {
          connection.all(query, (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      }

      const result = {
        success: true,
        data: results,
        fields,
        rowCount: Array.isArray(results) ? results.length : 0,
      };

      console.log('Database service query result:', result);
      return result;
    } catch (error) {
      console.error('Query execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async getTables(connectionId: string): Promise<Array<{ name: string; type?: string }>> {
    const connection = this.connections.get(connectionId);
    const connectionInfo = this.connectionInfo.get(connectionId);

    console.log('getTables called:', {
      connectionId,
      hasConnection: !!connection,
      hasConnectionInfo: !!connectionInfo,
      connectionInfo: connectionInfo ? {
        type: connectionInfo.type,
        database: connectionInfo.database,
        databaseType: typeof connectionInfo.database,
        databaseLength: connectionInfo.database?.length,
        host: connectionInfo.host
      } : null
    });

    if (!connection) {
      console.warn(`No active connection found for ID: ${connectionId}`);
      return []; // Return empty array instead of throwing error
    }

    if (!connectionInfo) {
      console.warn(`No connection info found for ID: ${connectionId}`);
      return []; // Return empty array instead of throwing error
    }

    try {
      let tables: Array<{ name: string; type?: string }> = [];

      if (connection instanceof Pool) {
        // PostgreSQL
        console.log('PostgreSQL getTables - database:', connectionInfo.database);
        // When connected to a specific database, query tables from public schema
        // If database is not specified, query from current database
        const query = `
          SELECT
            table_name as name,
            table_type as type
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type IN ('BASE TABLE', 'VIEW')
          ORDER BY table_name
        `;

        const result = await connection.query(query);

        console.log('PostgreSQL query result:', {
          rowCount: result.rowCount,
          rows: result.rows
        });

        tables = result.rows.map((row: any) => ({
          name: row.name,
          type: row.type === 'BASE TABLE' ? 'table' : row.type === 'VIEW' ? 'view' : row.type
        }));
      } else if (connection.query && typeof connection.query === 'function') {
        // MySQL
        console.log('MySQL getTables - database:', connectionInfo.database);

        let databaseName = connectionInfo.database?.trim();

        // If database name is not set, try to get current database
        if (!databaseName || databaseName === '') {
          try {
            const [dbResult] = await connection.query('SELECT DATABASE() as current_db');
            databaseName = (dbResult as Array<{ current_db: string }>)[0]?.current_db;
            console.log('MySQL current database:', databaseName);

            if (!databaseName || databaseName === '') {
              console.warn('MySQL database name is empty and no current database, cannot get tables');
              return [];
            }
          } catch (dbError) {
            console.warn('Could not get current database:', dbError);
            return [];
          }
        }

        const [results] = await connection.query(`
          SELECT
            TABLE_NAME as name,
            TABLE_TYPE as type
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = ?
            AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
          ORDER BY TABLE_NAME
        `, [databaseName]);

        console.log('MySQL query result:', {
          count: Array.isArray(results) ? results.length : 0,
          results: results,
          databaseUsed: databaseName
        });

        tables = (results as Array<{ name: string; type?: string }>).map((row: any) => ({
          name: row.name,
          type: row.type === 'BASE TABLE' ? 'table' : row.type === 'VIEW' ? 'view' : row.type
        }));
      } else if (connection.all) {
        // SQLite
        const results = await new Promise<Array<{ name: string; type?: string }>>((resolve, reject) => {
          connection.all(`
            SELECT
              name,
              type
            FROM sqlite_master
            WHERE type IN ('table', 'view')
            ORDER BY name
          `, (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        tables = results;
      }

      console.log('getTables returning:', {
        count: tables.length,
        tables: tables
      });

      return tables;
    } catch (error) {
      console.error('Error getting tables:', error);
      return []; // Return empty array on error instead of throwing
    }
  }

  async getTableStructure(connectionId: string, tableName: string): Promise<{
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
    indexes?: Array<{
      name: string;
      algorithm?: string;
      is_unique: boolean;
      column_name: string;
    }>;
  }> {
    const connection = this.connections.get(connectionId);
    const connectionInfo = this.connectionInfo.get(connectionId);

    if (!connection) {
      throw new Error(`No active connection found for ID: ${connectionId}`);
    }

    if (!connectionInfo) {
      throw new Error(`No connection info found for ID: ${connectionId}`);
    }

    try {
      let columns: Array<{
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
      let indexes: Array<{ name: string; algorithm?: string; is_unique: boolean; column_name: string }> = [];

      if (connection instanceof Pool) {
        // PostgreSQL
        const query = `
          SELECT
            ordinal_position,
            column_name as name,
            CASE
              WHEN character_maximum_length IS NOT NULL
                THEN data_type || '(' || character_maximum_length || ')'
              WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL
                THEN data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
              WHEN numeric_precision IS NOT NULL
                THEN data_type || '(' || numeric_precision || ')'
              ELSE data_type
            END as type,
            (is_nullable = 'YES')::boolean as nullable,
            character_set_name as character_set,
            collation_name as collation,
            column_default as default_value,
            ''::text as extra,
            ''::text as comment
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `;

        const result = await connection.query(query, [tableName]);
        const columnResults = result.rows;

        if (Array.isArray(columnResults) && columnResults.length > 0) {
          columns = columnResults.map((row: any) => ({
            name: row.name,
            type: row.type,
            nullable: Boolean(row.nullable),
            ordinal_position: row.ordinal_position,
            character_set: row.character_set || null,
            collation: row.collation || null,
            default_value: row.default_value || null,
            extra: row.extra || null,
            comment: row.comment || null
          }));
        } else {
          columns = [];
        }

        // Get row count for PostgreSQL
        try {
          const countResult = await connection.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
          rows = parseInt(countResult.rows[0]?.count || '0', 10);
        } catch (countError) {
          console.warn('Could not get row count for table:', tableName, countError);
        }

        // Get indexes for PostgreSQL
        try {
          const indexQuery = `
            SELECT
              i.relname as name,
              a.attname as column_name,
              ix.indisunique as is_unique,
              COALESCE(am.amname, 'btree') as algorithm,
              a.attnum
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            LEFT JOIN pg_am am ON i.relam = am.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE t.relkind = 'r' AND t.relname = $1
            GROUP BY i.relname, a.attname, ix.indisunique, am.amname, a.attnum
            ORDER BY i.relname, a.attnum
          `;
          const indexResult = await connection.query(indexQuery, [tableName]);

          if (Array.isArray(indexResult.rows)) {
            indexes = indexResult.rows.map((row: any) => ({
              name: row.name,
              column_name: row.column_name,
              is_unique: Boolean(row.is_unique),
              algorithm: row.algorithm || 'BTREE'
            }));
          }
        } catch (indexError) {
          console.warn('Could not get indexes for table:', tableName, indexError);
        }
      } else if (connection.query && typeof connection.query === 'function') {
        // MySQL
        const query = `
          SELECT
            ORDINAL_POSITION as ordinal_position,
            COLUMN_NAME as name,
            CONCAT(DATA_TYPE,
              CASE
                WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL THEN CONCAT('(', CHARACTER_MAXIMUM_LENGTH, ')')
                WHEN NUMERIC_PRECISION IS NOT NULL AND NUMERIC_SCALE IS NOT NULL THEN CONCAT('(', NUMERIC_PRECISION, ',', NUMERIC_SCALE, ')')
                WHEN NUMERIC_PRECISION IS NOT NULL THEN CONCAT('(', NUMERIC_PRECISION, ')')
                ELSE ''
              END
            ) as type,
            IS_NULLABLE = 'YES' as nullable,
            CHARACTER_SET_NAME as character_set,
            COLLATION_NAME as collation,
            COLUMN_DEFAULT as default_value,
            EXTRA as extra,
            COLUMN_COMMENT as comment
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `;

        const [columnResults] = await connection.query(query, [connectionInfo.database, tableName]);

        if (Array.isArray(columnResults)) {
          columns = columnResults as Array<{
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
        } else {
          columns = [];
        }

        // If no columns found, try alternative query
        if (columns.length === 0) {
          try {
            const [altResults] = await connection.query(`DESCRIBE \`${tableName}\``);
            if (Array.isArray(altResults)) {
              columns = altResults.map((row: any) => ({
                name: row.Field || row.field,
                type: row.Type || row.type,
                nullable: (row.Null || row.null) === 'YES'
              }));
            }
          } catch (altError) {
            console.warn('Alternative query failed:', altError);
          }
        }

        // Get row count
        try {
          const [countResults] = await connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
          rows = (countResults as any[])[0]?.count;
        } catch (countError) {
          console.warn('Could not get row count for table:', tableName, countError);
        }

        // Get indexes
        try {
          const indexQuery = `
            SELECT
              INDEX_NAME as name,
              INDEX_TYPE as algorithm,
              NON_UNIQUE = 0 as is_unique,
              COLUMN_NAME as column_name,
              SEQ_IN_INDEX as seq_in_index
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
          `;

          const [indexResults] = await connection.query(indexQuery, [connectionInfo.database, tableName]);

          if (Array.isArray(indexResults)) {
            // Process indexes to handle composite indexes properly
            const indexMap = new Map<string, { name: string; algorithm?: string; is_unique: boolean; columns: string[] }>();

            indexResults.forEach((row: any) => {
              const indexName = row.name;
              if (!indexMap.has(indexName)) {
                indexMap.set(indexName, {
                  name: indexName,
                  algorithm: row.algorithm,
                  is_unique: row.is_unique,
                  columns: []
                });
              }
              indexMap.get(indexName)!.columns.push(row.column_name);
            });

            // Convert to flat structure for table display
            indexes = [];
            indexMap.forEach((index) => {
              index.columns.forEach((columnName) => {
                indexes.push({
                  name: index.name,
                  algorithm: index.algorithm,
                  is_unique: index.is_unique,
                  column_name: columnName
                });
              });
            });
          }
        } catch (indexError) {
          console.warn('Could not get indexes for table:', tableName, indexError);
        }
      } else if (connection.all) {
        // SQLite
        const columnResults = await new Promise<Array<{ name: string; type: string; nullable: boolean }>>((resolve, reject) => {
          connection.all(`PRAGMA table_info(${tableName})`, (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else {
              const columns = rows.map(row => ({
                name: row.name,
                type: row.type,
                nullable: row.notnull === 0
              }));
              resolve(columns);
            }
          });
        });
        columns = columnResults;

        // SQLite indexes (simplified)
        try {
          const indexResults = await new Promise<Array<{ name: string; unique: number; origin: string }>>((resolve, reject) => {
            connection.all(`PRAGMA index_list(${tableName})`, (err: Error | null, rows: any[]) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });

          // Get detailed index info for each index
          for (const index of indexResults) {
            try {
              const indexInfoResults = await new Promise<Array<{ name: string; seqno: number }>>((resolve, reject) => {
                connection.all(`PRAGMA index_info(${index.name})`, (err: Error | null, rows: any[]) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });

              // Get column names from table info
              for (const indexInfo of indexInfoResults) {
                const columnName = indexInfo.name;
                indexes.push({
                  name: index.name,
                  algorithm: 'BTREE', // SQLite default
                  is_unique: index.unique === 1,
                  column_name: columnName
                });
              }
            } catch (indexInfoError) {
              console.warn(`Could not get info for index ${index.name}:`, indexInfoError);
            }
          }
        } catch (indexError) {
          console.warn('Could not get indexes for SQLite table:', tableName, indexError);
        }

        // Get row count for SQLite
        try {
          const countResults = await new Promise<Array<{ count: number }>>((resolve, reject) => {
            connection.all(`SELECT COUNT(*) as count FROM ${tableName}`, (err: Error | null, rows: any[]) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          rows = countResults[0]?.count;
        } catch (countError) {
          console.warn('Could not get row count for table:', tableName, countError);
        }
      }

      return { columns, rows, indexes };
    } catch (error) {
      console.error('Error getting table structure:', error);
      throw error;
    }
  }

  async getDatabases(connectionId: string): Promise<Array<{ name: string; tableCount?: number }>> {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      console.warn(`No active connection found for ID: ${connectionId}`);
      return []; // Return empty array instead of throwing error
    }

    try {
      let databases: Array<{ name: string; tableCount?: number }> = [];

      if (connection instanceof Pool) {
        // PostgreSQL
        const result = await connection.query(`
          SELECT datname as name
          FROM pg_database
          WHERE datistemplate = false
          ORDER BY datname
        `);

        databases = await Promise.all(
          result.rows.map(async (row: any) => {
            const dbName = row.name;
            try {
              // Get table count for each database
              const countResult = await connection.query(`
                SELECT COUNT(*) as count
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_catalog = $1
              `, [dbName]);

              const tableCount = parseInt(countResult.rows[0]?.count || '0', 10);

              return {
                name: dbName,
                tableCount: tableCount
              };
            } catch (err) {
              console.warn(`Could not get table count for database ${dbName}:`, err);
              return {
                name: dbName,
                tableCount: 0
              };
            }
          })
        );
      } else if (connection.query && typeof connection.query === 'function') {
        // MySQL - use SHOW DATABASES
        const [results] = await connection.query('SHOW DATABASES');

        // Convert to our format and get table counts
        databases = await Promise.all(
          (results as Array<{ Database: string }>).map(async (row) => {
            const dbName = row.Database;
            try {
              // Get table count for each database
              const [tableCountResult] = await connection.query(`
                SELECT COUNT(*) as count
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = ?
              `, [dbName]);

              const tableCount = (tableCountResult as Array<{ count: number }>)[0]?.count || 0;

              return {
                name: dbName,
                tableCount: tableCount
              };
            } catch (err) {
              console.warn(`Could not get table count for database ${dbName}:`, err);
              return {
                name: dbName,
                tableCount: 0
              };
            }
          })
        );
      } else if (connection.all) {
        // SQLite - databases are files, so we only have the current database
        const connectionInfo = this.connectionInfo.get(connectionId);
        if (connectionInfo && connectionInfo.database) {
          // Get table count for current database
          const tableCount = await new Promise<number>((resolve, reject) => {
            connection.all(`
              SELECT COUNT(*) as count
              FROM sqlite_master
              WHERE type IN ('table', 'view')
            `, (err: Error | null, rows: any[]) => {
              if (err) reject(err);
              else resolve(rows[0]?.count || 0);
            });
          });

          databases = [{
            name: connectionInfo.database,
            tableCount: tableCount
          }];
        }
      }

      return databases;
    } catch (error) {
      console.error('Error getting databases:', error);
      return []; // Return empty array on error instead of throwing
    }
  }

  async executeQuery(connectionId: string, query: string): Promise<QueryResult> {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      throw new Error(`No active connection found for ID: ${connectionId}`);
    }

    try {
      let result: QueryResult;

      if (connection instanceof Pool) {
        // PostgreSQL
        const queryResult = await connection.query(query);

        result = {
          success: true,
          data: queryResult.rows,
          fields: queryResult.fields?.map((field: any) => ({
            name: field.name,
            type: field.dataTypeID,
            length: field.dataTypeSize
          })) || [],
          rowCount: queryResult.rowCount || 0
        };
      } else if (connection.query && typeof connection.query === 'function') {
        // MySQL
        const [rows, fields] = await connection.query(query);

        result = {
          success: true,
          data: rows as any[],
          fields: fields?.map((field: any) => ({
            name: field.name,
            type: field.type,
            length: field.length
          })) || [],
          rowCount: Array.isArray(rows) ? rows.length : ((rows as any).affectedRows || 0)
        };
      } else if (connection.all) {
        // SQLite
        const rows = await new Promise<any[]>((resolve, reject) => {
          connection.all(query, (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        result = {
          success: true,
          data: rows,
          fields: [], // SQLite doesn't provide field info easily
          rowCount: rows.length
        };
      } else {
        throw new Error('Unsupported database connection type');
      }

      return result;
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();
