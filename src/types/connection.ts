export type DatabaseConnection = {
    id: `${string}-${string}-${string}-${string}-${string}`;
    name?: string;
    type: 'mysql' | 'postgresql' | 'sqlite';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    saved?: boolean;
  }

export type SavedConnection = Omit<DatabaseConnection, 'password' | 'name'> & {
  name: string;
  encryptedPassword: string;
  createdAt: string;
  lastUsed?: string;
}
