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