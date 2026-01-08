import type { DatabaseConnection } from '@/types/connection';

export interface SavedConnection extends Omit<DatabaseConnection, 'password' | 'ssh'> {
  name: string;
  encryptedPassword: string;
  ssh?: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    encryptedPassword?: string;
    encryptedPrivateKey?: string;
    encryptedPassphrase?: string;
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

      // Encrypt password before saving
      const encryptedPassword = await this.encryptPassword(connection.password);

      const savedConnection: SavedConnection = {
        id: connection.id,
        name,
        type: connection.type,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        encryptedPassword,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      };

      // Handle SSH config if enabled
      if (connection.ssh?.enabled) {
        savedConnection.ssh = {
          enabled: true,
          host: connection.ssh.host,
          port: connection.ssh.port || 22,
          username: connection.ssh.username,
        };

        // Encrypt SSH password if provided
        if (connection.ssh.password) {
          savedConnection.ssh.encryptedPassword = await this.encryptPassword(connection.ssh.password);
        }

        // Encrypt SSH private key if provided
        if (connection.ssh.privateKey) {
          savedConnection.ssh.encryptedPrivateKey = await this.encryptPassword(connection.ssh.privateKey);
        }

        // Encrypt SSH passphrase if provided
        if (connection.ssh.passphrase) {
          savedConnection.ssh.encryptedPassphrase = await this.encryptPassword(connection.ssh.passphrase);
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
      const filteredConnections = connections.filter(c => c.id !== connectionId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredConnections));
    } catch (error) {
      console.error('Error deleting connection:', error);
      throw new Error('Failed to delete connection');
    }
  }

  // Decrypt password for a saved connection
  async getDecryptedConnection(savedConnection: SavedConnection): Promise<DatabaseConnection & { name?: string }> {
    try {
      const decryptedPassword = await this.decryptPassword(savedConnection.encryptedPassword);

      const decrypted: DatabaseConnection & { name?: string } = {
        id: savedConnection.id,
        type: savedConnection.type,
        host: savedConnection.host,
        port: savedConnection.port,
        database: savedConnection.database,
        username: savedConnection.username,
        password: decryptedPassword,
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

        // Decrypt SSH password if exists
        if (savedConnection.ssh.encryptedPassword) {
          try {
            decrypted.ssh.password = await this.decryptPassword(savedConnection.ssh.encryptedPassword);
          } catch (err) {
            console.error('Failed to decrypt SSH password:', err);
          }
        }

        // Decrypt SSH private key if exists
        if (savedConnection.ssh.encryptedPrivateKey) {
          try {
            decrypted.ssh.privateKey = await this.decryptPassword(savedConnection.ssh.encryptedPrivateKey);
          } catch (err) {
            console.error('Failed to decrypt SSH private key:', err);
          }
        }

        // Decrypt SSH passphrase if exists
        if (savedConnection.ssh.encryptedPassphrase) {
          try {
            decrypted.ssh.passphrase = await this.decryptPassword(savedConnection.ssh.encryptedPassphrase);
          } catch (err) {
            console.error('Failed to decrypt SSH passphrase:', err);
          }
        }

        console.log('Decrypted SSH config:', {
          ...decrypted.ssh,
          password: decrypted.ssh.password ? '***' : undefined,
          privateKey: decrypted.ssh.privateKey ? '***' : undefined,
          passphrase: decrypted.ssh.passphrase ? '***' : undefined,
        });
      }

      return decrypted;
    } catch (error) {
      console.error('Error decrypting connection:', error);
      throw new Error('Failed to decrypt connection');
    }
  }

  // Simple encryption using Web Crypto API
  private async encryptPassword(password: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);

      // Create a proper key using PBKDF2 to derive a 256-bit key
      const salt = encoder.encode('db-client-salt');
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.ENCRYPTION_KEY),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      // Generate IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  // Simple decryption using Web Crypto API
  private async decryptPassword(encryptedPassword: string): Promise<string> {
    try {
      // Convert from base64
      const combined = new Uint8Array(
        atob(encryptedPassword).split('').map(char => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Create a proper key using PBKDF2 to derive a 256-bit key
      const encoder = new TextEncoder();
      const salt = encoder.encode('db-client-salt');
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.ENCRYPTION_KEY),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      // Convert to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt password');
    }
  }
}

export const storageService = new StorageService();
