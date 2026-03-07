import crypto from 'crypto';

const MASTER_KEY = process.env.ENCRYPTION_KEY;
if (!MASTER_KEY || MASTER_KEY.length < 64) {
  throw new Error('[encryption] ENCRYPTION_KEY env var is required (64 hex chars / 32 bytes). Set it in backend/.env');
}

function deriveKey(table: string, column: string): Buffer {
  return crypto.createHash('sha256').update(`${MASTER_KEY}:${table}:${column}`).digest();
}

export function encrypt(plaintext: string, table: string, column: string): string {
  const key = deriveKey(table, column);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

export function decrypt(ciphertext: string, table: string, column: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  const key = deriveKey(table, column);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}
