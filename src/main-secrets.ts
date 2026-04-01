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

// Tracks whether the macOS Keychain (keytar) is known to be broken in this session.
// Once set to true it stays true — we skip keytar for the rest of the session.
let keychainBroken = false;

let cachedMasterKey: Buffer | null = null;

/**
 * Returns the AES-256 master key used to encrypt/decrypt all secrets.
 *
 * Priority:
 *  1. In-memory cache (fastest, same session)
 *  2. File backend  (master.key in userData — reliable across rebuilds)
 *  3. macOS Keychain via keytar  (legacy migration path — only read, not written)
 *  4. Generate a fresh key and persist to file
 */
async function getOrCreateMasterKey(): Promise<Buffer> {
  if (cachedMasterKey) return cachedMasterKey;

  fs.mkdirSync(secretsDir(), { recursive: true });

  // 1. File backend is the source of truth for the master key.
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

  // 2. Migration: key was previously stored only in the macOS Keychain.
  //    Read it and immediately persist to file so future runs use the file.
  if (!keychainBroken) {
    try {
      const keytar = getKeytar();
      const existing = await keytar.getPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT);
      if (existing) {
        cachedMasterKey = Buffer.from(existing, 'base64');
        try {
          fs.writeFileSync(masterKeyFilePath(), existing, { encoding: 'utf-8' });
        } catch (writeErr) {
          console.error('[secrets] failed persisting migrated master key to file', writeErr);
        }
        return cachedMasterKey;
      }
    } catch (err) {
      keychainBroken = true;
      console.error('[secrets] keytar unavailable for master key, using file backend only', err);
    }
  }

  // 3. No existing key found — generate a new one and store in file.
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(masterKeyFilePath(), key.toString('base64'), { encoding: 'utf-8' });
  } catch (err) {
    console.error('[secrets] failed writing new master.key', err);
  }
  // Best-effort: also store in Keychain so older app versions can still read if needed.
  if (!keychainBroken) {
    try {
      const keytar = getKeytar();
      await keytar.setPassword(SERVICE_NAME, MASTER_KEY_ACCOUNT, key.toString('base64'));
    } catch {
      keychainBroken = true;
    }
  }
  cachedMasterKey = key;
  return key;
}

/**
 * Encrypts `value` and persists it under `id`.
 *
 * The encrypted payload is ALWAYS written to the file backend so it survives
 * app rebuilds and macOS Keychain access revocations.  If the Keychain is also
 * available it is written there too as an additive security layer.
 */
export async function saveSecret(id: string, value: string): Promise<void> {
  const masterKey = await getOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');

  // Primary store: file backend (always reliable).
  fileStoreSet(id, payload);

  // Secondary store: macOS Keychain (additive, best-effort).
  if (!keychainBroken) {
    try {
      const keytar = getKeytar();
      await keytar.setPassword(SERVICE_NAME, id, payload);
    } catch (err) {
      keychainBroken = true;
      console.error('[secrets] keytar.setPassword failed, file backend will be used', err);
    }
  }
}

/**
 * Retrieves and decrypts the secret stored under `id`.
 *
 * Lookup order:
 *  1. File backend (primary — written by all recent saves)
 *  2. macOS Keychain (fallback — for secrets saved before this change)
 */
export async function getSecret(id: string): Promise<string | null> {
  // 1. File backend first.
  let payload = fileStoreGet(id);

  // 2. Keychain fallback for secrets that existed before the file-first migration.
  if (!payload && !keychainBroken) {
    try {
      const keytar = getKeytar();
      const keychainPayload = await keytar.getPassword(SERVICE_NAME, id);
      if (keychainPayload) {
        payload = keychainPayload;
        // Migrate to file backend so the next read doesn't need Keychain.
        fileStoreSet(id, keychainPayload);
      }
    } catch (err) {
      keychainBroken = true;
      console.error('[secrets] keytar.getPassword failed, file backend only', err);
    }
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

/**
 * Deletes the secret stored under `id` from all backends.
 */
export async function deleteSecret(id: string): Promise<void> {
  // Primary store: always delete from file.
  fileStoreDelete(id);

  // Secondary store: best-effort keychain delete.
  if (!keychainBroken) {
    try {
      const keytar = getKeytar();
      await keytar.deletePassword(SERVICE_NAME, id);
    } catch (err) {
      keychainBroken = true;
      console.error('[secrets] keytar.deletePassword failed', err);
    }
  }
}
