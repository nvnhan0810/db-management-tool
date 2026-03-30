export type SshConfig = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  localPort?: number;
};

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
};
