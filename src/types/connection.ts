export type SshConfig = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  localPort?: number; // Auto-assigned local port for tunneling
}

export type DatabaseConnection = {
    id: `${string}-${string}-${string}-${string}-${string}`;
    name?: string;
    type: 'mysql' | 'postgresql' | 'sqlite';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssh?: SshConfig;
    saved?: boolean;
  }

export type SavedConnection = Omit<DatabaseConnection, 'password' | 'name'> & {
  name: string;
  encryptedPassword: string;
  createdAt: string;
  lastUsed?: string;
}
