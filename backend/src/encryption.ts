import crypto from 'crypto';

// Lazy check — warn but don't crash the entire server
const MASTER_KEY = process.env.ENCRYPTION_KEY || '';
if (!MASTER_KEY || MASTER_KEY.length < 64) {
  console.warn('[encryption] WARNING: ENCRYPTION_KEY not set or too short. Using fallback key. Set ENCRYPTION_KEY (64 hex chars) in environment variables.');
}
const EFFECTIVE_KEY = MASTER_KEY.length >= 64 ? MASTER_KEY : 'a3f8b2e1d4c6a9f7e0b5d8c3a6f9e2b1d4c7a0f3e6b9d2c5a8f1e4b7d0c3a6';

function deriveKey(table: string, column: string): Buffer {
  return crypto.createHash('sha256').update(`${EFFECTIVE_KEY}:${table}:${column}`).digest();
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
