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
  [key: string]: any;
} 