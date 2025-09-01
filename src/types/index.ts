export interface DatabaseConnection {
  id: `${string}-${string}-${string}-${string}-${string}`;
  name?: string;
  type: 'mysql' | 'postgresql' | 'sqlite';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface QueryHistoryItem {
  connection: string;
  query: string;
  timestamp: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  autoSaveInterval: number;
  defaultPort: number;
  connectionTimeout: number;
  maxResults: number;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  fields?: any[];
  rowCount?: number;
  error?: string;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default_value?: string;
  extra?: string;
  comment?: string;
  ordinal_position?: number;
  character_set?: string;
  collation?: string;
  foreign_key?: string;
}

export interface TableIndex {
  name: string;
  algorithm?: string;
  is_unique: boolean;
  column_name: string;
} 