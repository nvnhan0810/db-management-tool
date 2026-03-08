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
}

export async function saveSecret(id: string, value: string): Promise<void> {
  const masterKey = await getOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  const keytar = getKeytar();
  await keytar.setPassword(SERVICE_NAME, id, payload);
}

export async function getSecret(id: string): Promise<string | null> {
  const keytar = getKeytar();
  const payload = await keytar.getPassword(SERVICE_NAME, id);
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
  const keytar = getKeytar();
  await keytar.deletePassword(SERVICE_NAME, id);
}
