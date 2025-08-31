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

      return {
        success: true,
        results,
        fields,
        rowCount: Array.isArray(results) ? results.length : 0,
      };
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
}

export const databaseService = new DatabaseService(); 