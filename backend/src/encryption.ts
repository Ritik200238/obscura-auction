import crypto from 'crypto';

// ENCRYPTION_KEY is validated at startup by env.ts — guaranteed to exist here
const MASTER_KEY = process.env.ENCRYPTION_KEY!;

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

/**
 * Deterministic HMAC hash for indexed lookups.
 * Same input always produces the same output (unlike encrypt which uses random IV).
 * Used for WHERE clauses — store alongside encrypted value.
 */
export function hmacHash(plaintext: string, table: string, column: string): string {
  const key = deriveKey(table, column);
  return crypto.createHmac('sha256', key).update(plaintext).digest('hex');
}

export function decrypt(ciphertext: string, table: string, column: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error(`Invalid ciphertext format (expected 3 parts, got ${parts.length})`);
  const [ivHex, encHex, tagHex] = parts;
  const key = deriveKey(table, column);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
}
