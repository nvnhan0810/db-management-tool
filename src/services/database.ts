import mysql from 'mysql2/promise';
import type { DatabaseConnection, QueryResult } from '../types';

class DatabaseService {
  private connections: Map<string, any> = new Map();
  private connectionInfo: Map<string, DatabaseConnection> = new Map();

  async connect(connection: DatabaseConnection): Promise<boolean> {
    try {
      switch (connection.type) {
        case 'mysql':
          const mysqlConnection = await mysql.createConnection({
            host: connection.host,
            port: connection.port,
            user: connection.username,
            password: connection.password,
            database: connection.database,
          });
          
          this.connections.set(connection.id, mysqlConnection);
          this.connectionInfo.set(connection.id, connection);
          break;

        // case 'postgresql':
        //   const pgPool = new Pool({
        //     host: connection.host,
        //     port: connection.port,
        //     user: connection.username,
        //     password: connection.password,
        //     database: connection.database,
        //   });
        //   this.connections.set(connection.id, pgPool);
        //   this.connectionInfo.set(connection.id, connection);
        //   break;

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
      return false;
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

      if (connection.query) {
        [results, fields] = await connection.query(query);
      } else if (connection.all) {
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

      if (connection.query) {
        // MySQL/PostgreSQL
        const [results] = await connection.query(`
          SELECT 
            TABLE_NAME as name,
            TABLE_TYPE as type
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = ?
          ORDER BY TABLE_NAME
        `, [connectionInfo.database]);
        
        tables = results as Array<{ name: string; type?: string }>;
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

      if (connection.query) {
        // MySQL/PostgreSQL
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
            const [altResults] = await connection.query(`DESCRIBE ${tableName}`);
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
          const [countResults] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          rows = (countResults as any[])[0]?.count;
        } catch (countError) {
          console.warn('Could not get row count for table:', tableName, countError);
        }

        // Get indexes
        let indexes: Array<{ name: string; algorithm?: string; is_unique: boolean; column_name: string }> = [];
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
}

export const databaseService = new DatabaseService(); 