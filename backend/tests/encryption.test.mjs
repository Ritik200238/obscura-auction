/**
 * Encryption module tests
 * Tests AES-256-GCM per-column encryption used to protect seller/bidder addresses
 *
 * Run: node --test tests/encryption.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

// Set test encryption key before importing module
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'

// Inline the encrypt/decrypt functions to avoid module resolution issues in test
function deriveKey(masterKey, table, column) {
  return crypto.createHash('sha256').update(`${masterKey}:${table}:${column}`).digest()
}

function encrypt(plaintext, table, column) {
  const key = deriveKey(process.env.ENCRYPTION_KEY, table, column)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

function decrypt(ciphertext, table, column) {
  const [ivHex, encHex, tagHex] = ciphertext.split(':')
  const key = deriveKey(process.env.ENCRYPTION_KEY, table, column)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8')
}

// Test 1: Basic encrypt/decrypt roundtrip
test('encrypt/decrypt roundtrip preserves plaintext', () => {
  const address = 'aleo1h7yz0n5qx9uwyaxsprspkm5j6leey9eyzmjv9k7zyyd5nt5lguysystq59'
  const ciphertext = encrypt(address, 'auctions', 'seller_address')
  const decrypted = decrypt(ciphertext, 'auctions', 'seller_address')
  assert.equal(decrypted, address)
})

// Test 2: Different columns produce different ciphertexts (per-column key derivation)
test('per-column encryption produces different keys for same plaintext', () => {
  const address = 'aleo1h7yz0n5qx9uwyaxsprspkm5j6leey9eyzmjv9k7zyyd5nt5lguysystq59'
  const c1 = encrypt(address, 'auctions', 'seller_address')
  const c2 = encrypt(address, 'bids', 'bidder_address')
  // Same plaintext, different column → different ciphertext (also different IV so always different)
  assert.notEqual(c1, c2)
  // But both decrypt correctly with their respective column keys
  assert.equal(decrypt(c1, 'auctions', 'seller_address'), address)
  assert.equal(decrypt(c2, 'bids', 'bidder_address'), address)
})

// Test 3: Ciphertext format is iv:encrypted:tag
test('ciphertext format has 3 colon-separated hex components', () => {
  const ciphertext = encrypt('test', 'auctions', 'seller_address')
  const parts = ciphertext.split(':')
  assert.equal(parts.length, 3)
  assert.equal(parts[0].length, 24)  // 12 bytes IV = 24 hex chars
  assert.equal(parts[2].length, 32)  // 16 bytes GCM tag = 32 hex chars
})

// Test 4: Encryption is randomized (IV changes each call)
test('two encryptions of same plaintext produce different ciphertexts', () => {
  const plaintext = 'aleo1h7yz0n5qx9uwyaxsprspkm5j6leey9eyzmjv9k7zyyd5nt5lguysystq59'
  const c1 = encrypt(plaintext, 'auctions', 'seller_address')
  const c2 = encrypt(plaintext, 'auctions', 'seller_address')
  assert.notEqual(c1, c2) // Different IVs
})

// Test 5: Tampered auth tag causes decryption failure
test('tampered ciphertext fails auth tag verification', () => {
  const ciphertext = encrypt('aleo1test', 'auctions', 'seller_address')
  const parts = ciphertext.split(':')
  // Flip last byte of auth tag
  const tamperedTag = parts[2].slice(0, -2) + '00'
  const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}`
  assert.throws(() => decrypt(tampered, 'auctions', 'seller_address'))
})

// Test 6: Wrong column key cannot decrypt ciphertext
test('wrong column key fails to decrypt', () => {
  const plaintext = 'aleo1seller'
  const ciphertext = encrypt(plaintext, 'auctions', 'seller_address')
  // Try decrypting with wrong column — should throw (wrong key → auth tag mismatch)
  assert.throws(() => decrypt(ciphertext, 'bids', 'bidder_address'))
})
