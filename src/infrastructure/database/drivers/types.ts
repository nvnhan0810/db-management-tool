import type { DatabaseConnection } from '@/domain/connection/types';
import type { QueryResult } from '@/domain/query/types';

export type DriverConnection = unknown;

export type TableInfo = {
  name: string;
  type?: string;
};

export type TableStructure = {
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
  primaryKeyColumns?: string[];
};

export type ExportProgress = {
  stage: 'table:batch';
  rowsDone: number;
  rowsTotal: number;
};

export type WriteChunk = (chunk: string) => Promise<void>;

export interface DatabaseDriver {
  connect(connection: DatabaseConnection, host: string, port: number): Promise<DriverConnection>;
  disconnect(connection: DriverConnection): Promise<void>;
  query(connection: DriverConnection, query: string): Promise<QueryResult>;
  executeQuery(connection: DriverConnection, query: string): Promise<QueryResult>;
  getTables(connection: DriverConnection, info: DatabaseConnection): Promise<TableInfo[]>;
  getTableStructure(connection: DriverConnection, info: DatabaseConnection, tableName: string): Promise<TableStructure>;
  getDatabases(connection: DriverConnection): Promise<Array<{ name: string; tableCount?: number }>>;
  exportTableSql(
    connection: DriverConnection,
    table: string,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<string>;
  exportTableSqlToWriter(
    connection: DriverConnection,
    table: string,
    write: WriteChunk,
    includeStructure: boolean,
    includeData: boolean,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<void>;
  dropTable(connection: DriverConnection, tableName: string, tableType?: string): Promise<void>;
  dropDatabase(connection: DriverConnection, info: DatabaseConnection, databaseName: string): Promise<void>;
}
