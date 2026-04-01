import { getKeytar } from '@/utils/native-modules';
import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SERVICE_NAME = (process.env.SERVICE_NAME as string) || 'db-management-tool';
const MASTER_KEY_ACCOUNT = (process.env.MASTER_KEY_ACCOUNT as string) || 'master-key';

function getUserDataPath() {
  return app.getPath('userData');
}

function secretsDir(): string {
  return getUserDataPath();
}

function masterKeyFilePath(): string {
  return path.join(secretsDir(), 'master.key');
}

function fileSecretsPath(): string {
  return path.join(secretsDir(), 'secrets-store.json');
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { encoding: 'utf-8' });
}

type FileSecretStore = Record<string, string>;

function fileStoreGet(id: string): string | null {
  const store = readJsonFile<FileSecretStore>(fileSecretsPath(), {});
  return store[id] ?? null;
}

function fileStoreSet(id: string, value: string): void {
  const store = readJsonFile<FileSecretStore>(fileSecretsPath(), {});
  store[id] = value;
  writeJsonFile(fileSecretsPath(), store);
}

function fileStoreDelete(id: string): void {
  const store = readJsonFile<FileSecretStore>(fileSecretsPath(), {});
  if (Object.prototype.hasOwnProperty.call(store, id)) {
    delete store[id];
    writeJsonFile(fileSecretsPath(), store);
  }
}

let useFileBackend = false;

function getOrCreateMasterKeyId(): string {
  const userDataPath = getUserDataPath();
  const filePath = path.join(userDataPath, 'secrets.json');

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.masterKeyId && typeof parsed.masterKeyId === 'string') {
        return parsed.masterKeyId;
      }
    }
  } catch (err) {
    console.error('Failed to read secrets.json:', err);
  }

  const masterKeyId = crypto.randomUUID();
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ masterKeyId }), 'utf-8');
  } catch (err) {
    console.error('Failed to write secrets.json:', err);
  }
  return masterKeyId;
}

let cachedMasterKey: Buffer | null = null;

async function getOrCreateMasterKey(): Promise<Buffer> {
  if (cachedMasterKey) return cachedMasterKey;

  // Prefer Keychain via keytar, but fall back to file storage if keytar is blocked in packaged builds.
  if (!useFileBackend) {
    try {
      const keytar = getKeytar();
      const existing = await keytar.getPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);
      if (existing) {
        cachedMasterKey = Buffer.from(existing, 'base64');
        return cachedMasterKey;
      }

      const key = crypto.randomBytes(32);
      await keytar.setPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT, key.toString('base64'));
      cachedMasterKey = key;
      return key;
    } catch (err) {
      useFileBackend = true;
      console.error('[secrets] keytar unavailable, falling back to file backend', err);
    }
  }

  // File backend: store master key in userData (best-effort, not as strong as Keychain).
  fs.mkdirSync(secretsDir(), { recursive: true });
  try {
    if (fs.existsSync(masterKeyFilePath())) {
      const raw = fs.readFileSync(masterKeyFilePath(), 'utf-8').trim();
      if (raw) {
        cachedMasterKey = Buffer.from(raw, 'base64');
        return cachedMasterKey;
      }
    }
  } catch (err) {
    console.error('[secrets] failed reading master.key', err);
  }

  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(masterKeyFilePath(), key.toString('base64'), { encoding: 'utf-8' });
  } catch (err) {
    console.error('[secrets] failed writing master.key', err);
  }
  cachedMasterKey = key;
  return key;
}

export async function saveSecret(id: string, value: string): Promise<void> {
  const masterKey = await getOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  if (!useFileBackend) {
    try {
      const keytar = getKeytar();
      await keytar.setPassword(SERVICE_NAME, id, payload);
      return;
    } catch (err) {
      useFileBackend = true;
      console.error('[secrets] keytar.setPassword failed, switching to file backend', err);
    }
  }
  fileStoreSet(id, payload);
}

export async function getSecret(id: string): Promise<string | null> {
  let payload: string | null = null;
  if (!useFileBackend) {
    try {
      const keytar = getKeytar();
      payload = await keytar.getPassword(SERVICE_NAME, id);
    } catch (err) {
      useFileBackend = true;
      console.error('[secrets] keytar.getPassword failed, switching to file backend', err);
    }
  }
  if (useFileBackend) {
    payload = fileStoreGet(id);
  }
  if (!payload) return null;

  const masterKey = await getOrCreateMasterKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export async function deleteSecret(id: string): Promise<void> {
  if (!useFileBackend) {
    try {
      const keytar = getKeytar();
      await keytar.deletePassword(SERVICE_NAME, id);
      return;
    } catch (err) {
      useFileBackend = true;
      console.error('[secrets] keytar.deletePassword failed, switching to file backend', err);
    }
  }
  fileStoreDelete(id);
}
