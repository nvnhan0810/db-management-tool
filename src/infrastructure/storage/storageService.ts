import type { DatabaseConnection } from '@/domain/connection/types';

export interface SavedConnection extends Omit<DatabaseConnection, 'password' | 'ssh'> {
  name: string;
  passwordId: string;
  ssh?: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    passwordId?: string;
    privateKeyId?: string;
    passphraseId?: string;
  };
  createdAt: string;
  lastUsed?: string;
}

const STORAGE_KEY = 'saved_connections';

class StorageService {
  async getSavedConnections(): Promise<SavedConnection[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const connections: SavedConnection[] = JSON.parse(stored);
      return connections.sort((a, b) => {
        const aDate = a.lastUsed || a.createdAt;
        const bDate = b.lastUsed || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
    } catch {
      return [];
    }
  }

  async saveConnection(connection: DatabaseConnection, name: string): Promise<void> {
    const existingConnections = await this.getSavedConnections();
    const passwordId = `conn:${connection.id}:dbPassword`;

    const savedConnection: SavedConnection = {
      id: connection.id,
      name,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      passwordId,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    if (connection.ssh?.enabled) {
      savedConnection.ssh = {
        enabled: true,
        host: connection.ssh.host,
        port: connection.ssh.port || 22,
        username: connection.ssh.username,
        passwordId: connection.ssh.password ? `conn:${connection.id}:sshPassword` : undefined,
        privateKeyId: connection.ssh.privateKey ? `conn:${connection.id}:sshPrivateKey` : undefined,
        passphraseId: connection.ssh.passphrase ? `conn:${connection.id}:sshPassphrase` : undefined,
      };
    }

    await window.electron.invoke('secrets:save', { id: passwordId, value: connection.password });

    if (connection.ssh?.enabled) {
      if (connection.ssh.password && savedConnection.ssh?.passwordId) {
        await window.electron.invoke('secrets:save', {
          id: savedConnection.ssh.passwordId,
          value: connection.ssh.password,
        });
      }
      if (connection.ssh.privateKey && savedConnection.ssh?.privateKeyId) {
        await window.electron.invoke('secrets:save', {
          id: savedConnection.ssh.privateKeyId,
          value: connection.ssh.privateKey,
        });
      }
      if (connection.ssh.passphrase && savedConnection.ssh?.passphraseId) {
        await window.electron.invoke('secrets:save', {
          id: savedConnection.ssh.passphraseId,
          value: connection.ssh.passphrase,
        });
      }
    }

    const existingIndex = existingConnections.findIndex((c) => c.id === connection.id);
    if (existingIndex >= 0) {
      existingConnections[existingIndex] = savedConnection;
    } else {
      existingConnections.push(savedConnection);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingConnections));
  }

  async updateLastUsed(connectionId: string): Promise<void> {
    const connections = await this.getSavedConnections();
    const conn = connections.find((c) => c.id === connectionId);
    if (conn) {
      conn.lastUsed = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
    }
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const connections = await this.getSavedConnections();
    const conn = connections.find((c) => c.id === connectionId);
    const filtered = connections.filter((c) => c.id !== connectionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    if (conn) {
      await window.electron.invoke('secrets:delete', { id: conn.passwordId });
      if (conn.ssh?.passwordId) await window.electron.invoke('secrets:delete', { id: conn.ssh.passwordId });
      if (conn.ssh?.privateKeyId) await window.electron.invoke('secrets:delete', { id: conn.ssh.privateKeyId });
      if (conn.ssh?.passphraseId) await window.electron.invoke('secrets:delete', { id: conn.ssh.passphraseId });
    }
  }

  async getDecryptedConnection(
    saved: SavedConnection
  ): Promise<DatabaseConnection & { name?: string }> {
    const decryptedPassword = (await window.electron.invoke('secrets:get', {
      id: saved.passwordId,
    })) as string | null;

    const decrypted: DatabaseConnection & { name?: string } = {
      id: saved.id,
      type: saved.type,
      host: saved.host,
      port: saved.port,
      database: saved.database,
      username: saved.username,
      password: decryptedPassword || '',
      name: saved.name,
    };

    if (saved.ssh?.enabled) {
      decrypted.ssh = {
        enabled: true,
        host: saved.ssh.host || '',
        port: saved.ssh.port || 22,
        username: saved.ssh.username || '',
      };

      if (saved.ssh.passwordId) {
        const pwd = (await window.electron.invoke('secrets:get', { id: saved.ssh.passwordId })) as string | null;
        if (pwd) decrypted.ssh!.password = pwd;
      }
      if (saved.ssh.privateKeyId) {
        const key = (await window.electron.invoke('secrets:get', { id: saved.ssh.privateKeyId })) as string | null;
        if (key) decrypted.ssh!.privateKey = key;
      }
      if (saved.ssh.passphraseId) {
        const phrase = (await window.electron.invoke('secrets:get', { id: saved.ssh.passphraseId })) as string | null;
        if (phrase) decrypted.ssh!.passphrase = phrase;
      }
    }

    return decrypted;
  }
}

export const storageService = new StorageService();
