import mysql from 'mysql2/promise';
import type { DatabaseConnection, QueryResult } from '../types';

class DatabaseService {
  private connections: Map<string, any> = new Map();

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
        //   break;

        // case 'sqlite':
        //   const sqliteDb = new sqlite3.Database(connection.database);
        //   this.connections.set(connection.id, sqliteDb);
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
}

export const databaseService = new DatabaseService(); 