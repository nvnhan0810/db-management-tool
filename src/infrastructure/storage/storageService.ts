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
  private ensureOk(resp: unknown, fallbackMessage: string) {
    if (resp === true) return;
    if (resp && typeof resp === 'object' && 'success' in resp) {
      const r = resp as { success?: boolean; error?: string };
      if (r.success) return;
      throw new Error(r.error || fallbackMessage);
    }
    throw new Error(fallbackMessage);
  }

  async getSavedConnections(): Promise<SavedConnection[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const connections: SavedConnection[] = JSON.parse(stored);
      // Preserve stored order; UI handles grouping/sorting/reordering.
      return connections;
    } catch {
      return [];
    }
  }

  async reorderSavedConnections(idsInOrder: string[]): Promise<void> {
    const connections = await this.getSavedConnections();
    if (!idsInOrder || idsInOrder.length === 0) return;
    const byId = new Map(connections.map((c) => [c.id, c] as const));
    const out: SavedConnection[] = [];
    for (const id of idsInOrder) {
      const c = byId.get(id);
      if (c) out.push(c);
      byId.delete(id);
    }
    // append remaining (unknown/unmentioned ids)
    for (const c of connections) {
      if (byId.has(c.id)) out.push(c);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  }

  async saveConnection(connection: DatabaseConnection, name: string): Promise<void> {
    const existingConnections = await this.getSavedConnections();
    const existingIndex = existingConnections.findIndex((c) => c.id === connection.id);
    const prev = existingIndex >= 0 ? existingConnections[existingIndex] : null;
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
      createdAt: prev?.createdAt ?? new Date().toISOString(),
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

    this.ensureOk(
      await window.electron.invoke('secrets:save', { id: passwordId, value: connection.password }),
      'Failed to save DB password'
    );

    if (connection.ssh?.enabled) {
      if (connection.ssh.password && savedConnection.ssh?.passwordId) {
        this.ensureOk(
          await window.electron.invoke('secrets:save', {
            id: savedConnection.ssh.passwordId,
            value: connection.ssh.password,
          }),
          'Failed to save SSH password'
        );
      }
      if (connection.ssh.privateKey && savedConnection.ssh?.privateKeyId) {
        this.ensureOk(
          await window.electron.invoke('secrets:save', {
            id: savedConnection.ssh.privateKeyId,
            value: connection.ssh.privateKey,
          }),
          'Failed to save SSH private key'
        );
      }
      if (connection.ssh.passphrase && savedConnection.ssh?.passphraseId) {
        this.ensureOk(
          await window.electron.invoke('secrets:save', {
            id: savedConnection.ssh.passphraseId,
            value: connection.ssh.passphrase,
          }),
          'Failed to save SSH passphrase'
        );
      }
    }

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
      this.ensureOk(
        await window.electron.invoke('secrets:delete', { id: conn.passwordId }),
        'Failed to delete DB password secret'
      );
      if (conn.ssh?.passwordId) {
        this.ensureOk(
          await window.electron.invoke('secrets:delete', { id: conn.ssh.passwordId }),
          'Failed to delete SSH password secret'
        );
      }
      if (conn.ssh?.privateKeyId) {
        this.ensureOk(
          await window.electron.invoke('secrets:delete', { id: conn.ssh.privateKeyId }),
          'Failed to delete SSH private key secret'
        );
      }
      if (conn.ssh?.passphraseId) {
        this.ensureOk(
          await window.electron.invoke('secrets:delete', { id: conn.ssh.passphraseId }),
          'Failed to delete SSH passphrase secret'
        );
      }
    }
  }

  exportConnectionsJson(connections: SavedConnection[]): string {
    const exported = connections.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      host: c.host,
      port: c.port,
      database: c.database,
      username: c.username,
      ssh: c.ssh?.enabled
        ? {
            enabled: true,
            host: c.ssh.host,
            port: c.ssh.port,
            username: c.ssh.username,
          }
        : { enabled: false },
      createdAt: c.createdAt,
      lastUsed: c.lastUsed,
    }));
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), connections: exported },
      null,
      2
    );
  }

  async importConnectionsJson(jsonText: string): Promise<void> {
    const parsed = JSON.parse(jsonText) as { connections?: any[] };
    const incoming = Array.isArray(parsed?.connections) ? parsed.connections : [];
    if (incoming.length === 0) return;

    const existing = await this.getSavedConnections();
    const byId = new Map(existing.map((c) => [c.id, c] as const));

    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || '').trim();
      const name = String(raw.name || '').trim();
      const type = String(raw.type || '').trim();
      const host = String(raw.host || '').trim();
      const port = Number(raw.port || 0);
      const database = raw.database != null ? String(raw.database) : undefined;
      const username = raw.username != null ? String(raw.username) : '';
      if (!id || !name || !type || !host || !port) continue;

      const passwordId = `conn:${id}:dbPassword`;
      const sshEnabled = Boolean(raw.ssh?.enabled);
      const saved: SavedConnection = {
        id,
        name,
        type: type as SavedConnection['type'],
        host,
        port,
        database,
        username,
        passwordId,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
        lastUsed: typeof raw.lastUsed === 'string' ? raw.lastUsed : undefined,
      };

      if (sshEnabled) {
        saved.ssh = {
          enabled: true,
          host: String(raw.ssh.host || ''),
          port: Number(raw.ssh.port || 22),
          username: String(raw.ssh.username || ''),
          // Secrets will be re-entered by user when editing connection
          passwordId: undefined,
          privateKeyId: undefined,
          passphraseId: undefined,
        };
      }

      if (byId.has(id)) {
        const prev = byId.get(id)!;
        // keep existing secret ids (so imported metadata doesn't break saved secrets)
        saved.passwordId = prev.passwordId;
        if (prev.ssh?.enabled && saved.ssh?.enabled) {
          saved.ssh.passwordId = prev.ssh.passwordId;
          saved.ssh.privateKeyId = prev.ssh.privateKeyId;
          saved.ssh.passphraseId = prev.ssh.passphraseId;
        }
        byId.set(id, { ...prev, ...saved });
      } else {
        byId.set(id, saved);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(byId.values())));
  }

  async getDecryptedConnection(
    saved: SavedConnection
  ): Promise<DatabaseConnection & { name?: string }> {
    const dbPwdResp = (await window.electron.invoke('secrets:get', {
      id: saved.passwordId,
    })) as { success?: boolean; value?: string | null; error?: string } | string | null;
    const decryptedPassword =
      typeof dbPwdResp === 'string' || dbPwdResp === null
        ? dbPwdResp
        : dbPwdResp.success
          ? (dbPwdResp.value ?? null)
          : (() => {
              throw new Error(dbPwdResp.error || 'Failed to decrypt DB password');
            })();

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
        const r = (await window.electron.invoke('secrets:get', { id: saved.ssh.passwordId })) as
          | { success?: boolean; value?: string | null; error?: string }
          | string
          | null;
        const pwd = typeof r === 'string' || r === null ? r : r.success ? (r.value ?? null) : (() => { throw new Error(r.error || 'Failed to decrypt SSH password'); })();
        if (pwd) decrypted.ssh!.password = pwd;
      }
      if (saved.ssh.privateKeyId) {
        const r = (await window.electron.invoke('secrets:get', { id: saved.ssh.privateKeyId })) as
          | { success?: boolean; value?: string | null; error?: string }
          | string
          | null;
        const key = typeof r === 'string' || r === null ? r : r.success ? (r.value ?? null) : (() => { throw new Error(r.error || 'Failed to decrypt SSH private key'); })();
        if (key) decrypted.ssh!.privateKey = key;
      }
      if (saved.ssh.passphraseId) {
        const r = (await window.electron.invoke('secrets:get', { id: saved.ssh.passphraseId })) as
          | { success?: boolean; value?: string | null; error?: string }
          | string
          | null;
        const phrase = typeof r === 'string' || r === null ? r : r.success ? (r.value ?? null) : (() => { throw new Error(r.error || 'Failed to decrypt SSH passphrase'); })();
        if (phrase) decrypted.ssh!.passphrase = phrase;
      }
    }

    return decrypted;
  }
}

export const storageService = new StorageService();
