import type { DatabaseConnection } from '@/types/connection';

// Saved connection metadata (no raw secrets stored here)
export interface SavedConnection extends Omit<DatabaseConnection, 'password' | 'ssh'> {
  name: string;
  // IDs used to look up secrets in keychain via IPC
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

class StorageService {
  private readonly STORAGE_KEY = 'saved_connections';
  private readonly ENCRYPTION_KEY = 'db_client_encryption_key';

  // Get saved connections from local storage
  async getSavedConnections(): Promise<SavedConnection[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];

      const connections: SavedConnection[] = JSON.parse(stored);
      return connections.sort((a, b) => {
        // Sort by last used date, then by creation date
        const aDate = a.lastUsed || a.createdAt;
        const bDate = b.lastUsed || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
    } catch (error) {
      console.error('Error loading saved connections:', error);
      return [];
    }
  }

  // Save a new connection
  async saveConnection(connection: DatabaseConnection, name: string): Promise<void> {
    try {
      const existingConnections = await this.getSavedConnections();

      // Create IDs for secrets (per-connection)
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

      // Handle SSH config if enabled
      if (connection.ssh?.enabled) {
        const sshPasswordId = connection.ssh.password ? `conn:${connection.id}:sshPassword` : undefined;
        const sshPrivateKeyId = connection.ssh.privateKey ? `conn:${connection.id}:sshPrivateKey` : undefined;
        const sshPassphraseId = connection.ssh.passphrase ? `conn:${connection.id}:sshPassphrase` : undefined;

        savedConnection.ssh = {
          enabled: true,
          host: connection.ssh.host,
          port: connection.ssh.port || 22,
          username: connection.ssh.username,
          passwordId: sshPasswordId,
          privateKeyId: sshPrivateKeyId,
          passphraseId: sshPassphraseId,
        };
      }

      // Persist secrets in OS keychain via IPC
      await window.electron.invoke('secrets:save', {
        id: passwordId,
        value: connection.password,
      });

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

      // Check if connection with same id already exists
      const existingIndex = existingConnections.findIndex(c => c.id === connection.id);
      if (existingIndex >= 0) {
        existingConnections[existingIndex] = savedConnection;
      } else {
        existingConnections.push(savedConnection);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingConnections));
    } catch (error) {
      console.error('Error saving connection:', error);
      throw new Error('Failed to save connection');
    }
  }

  // Update last used timestamp
  async updateLastUsed(connectionId: string): Promise<void> {
    try {
      const connections = await this.getSavedConnections();
      const connection = connections.find(c => c.id === connectionId);
      if (connection) {
        connection.lastUsed = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
      }
    } catch (error) {
      console.error('Error updating last used:', error);
    }
  }

  // Delete a saved connection
  async deleteConnection(connectionId: string): Promise<void> {
    try {
      const connections = await this.getSavedConnections();
      const connection = connections.find(c => c.id === connectionId);
      const filteredConnections = connections.filter(c => c.id !== connectionId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredConnections));

      // Also delete secrets from keychain
      if (connection) {
        await window.electron.invoke('secrets:delete', { id: connection.passwordId });

        if (connection.ssh?.passwordId) {
          await window.electron.invoke('secrets:delete', { id: connection.ssh.passwordId });
        }
        if (connection.ssh?.privateKeyId) {
          await window.electron.invoke('secrets:delete', { id: connection.ssh.privateKeyId });
        }
        if (connection.ssh?.passphraseId) {
          await window.electron.invoke('secrets:delete', { id: connection.ssh.passphraseId });
        }
      }
    } catch (error) {
      console.error('Error deleting connection:', error);
      throw new Error('Failed to delete connection');
    }
  }

  // Decrypt password for a saved connection
  async getDecryptedConnection(savedConnection: SavedConnection): Promise<DatabaseConnection & { name?: string }> {
    try {
      // Load secrets from keychain via IPC
      const decryptedPassword = await window.electron.invoke('secrets:get', { id: savedConnection.passwordId }) as string | null;

      const decrypted: DatabaseConnection & { name?: string } = {
        id: savedConnection.id,
        type: savedConnection.type,
        host: savedConnection.host,
        port: savedConnection.port,
        database: savedConnection.database,
        username: savedConnection.username,
        password: decryptedPassword || '',
        name: savedConnection.name,
      };

      // Decrypt SSH config if exists
      if (savedConnection.ssh && savedConnection.ssh.enabled) {
        decrypted.ssh = {
          enabled: true,
          host: savedConnection.ssh.host || '',
          port: savedConnection.ssh.port || 22,
          username: savedConnection.ssh.username || '',
        };

        // Load SSH secrets if IDs exist
        if (savedConnection.ssh.passwordId) {
          try {
            const sshPassword = await window.electron.invoke('secrets:get', { id: savedConnection.ssh.passwordId }) as string | null;
            if (sshPassword) decrypted.ssh.password = sshPassword;
          } catch (err) {
            console.error('Failed to load SSH password from keychain:', err);
          }
        }

        if (savedConnection.ssh.privateKeyId) {
          try {
            const sshPrivateKey = await window.electron.invoke('secrets:get', { id: savedConnection.ssh.privateKeyId }) as string | null;
            if (sshPrivateKey) decrypted.ssh.privateKey = sshPrivateKey;
          } catch (err) {
            console.error('Failed to load SSH private key from keychain:', err);
          }
        }

        if (savedConnection.ssh.passphraseId) {
          try {
            const sshPassphrase = await window.electron.invoke('secrets:get', { id: savedConnection.ssh.passphraseId }) as string | null;
            if (sshPassphrase) decrypted.ssh.passphrase = sshPassphrase;
          } catch (err) {
            console.error('Failed to load SSH passphrase from keychain:', err);
          }
        }
      }

      return decrypted;
    } catch (error) {
      console.error('Error decrypting connection:', error);
      throw new Error('Failed to decrypt connection');
    }
  }

  // Note: Encryption/decryption is now handled in main process via OS keychain (keytar)
}

export const storageService = new StorageService();
