import { config } from './config'
import type { AuctionData, AuctionPhase } from '@/types'

/**
 * Fetch a mapping value from the Aleo explorer API.
 * Accepts optional programId for cross-program lookups.
 */
export async function fetchMapping(
  mappingName: string,
  key: string,
  programId?: string
): Promise<string | null> {
  const pid = programId || config.programId
  const url = `${config.explorerApi}/${config.network}/program/${pid}/mapping/${mappingName}/${key}`
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const text = await response.text()
    if (text === 'null' || text === '' || text === '""') return null
    return text.replace(/^"/, '').replace(/"$/, '')
  } catch {
    return null
  }
}

/**
 * Fetch current block height from explorer.
 */
export async function fetchBlockHeight(): Promise<number> {
  const url = `${config.explorerApi}/${config.network}/block/height/latest`
  try {
    const response = await fetch(url)
    if (!response.ok) return 0
    const text = await response.text()
    return parseInt(text, 10) || 0
  } catch {
    return 0
  }
}

/** Parse a u128 value from Aleo format (e.g. "1000000u128") */
export function parseU128(val: string): bigint {
  const cleaned = val.replace(/u128\s*$/, '').trim()
  try {
    return BigInt(cleaned)
  } catch {
    return 0n
  }
}

/** Parse a u64 value from Aleo format (e.g. "100u64") */
export function parseU64(val: string): number {
  return parseInt(val.replace(/u64\s*$/, '').trim(), 10) || 0
}

/** Parse a u8 value from Aleo format (e.g. "1u8") */
export function parseU8(val: string): number {
  return parseInt(val.replace(/u8\s*$/, '').trim(), 10) || 0
}

/** Parse a field value from Aleo format (e.g. "123field") */
export function parseField(val: string): string {
  return val.replace(/field\s*$/, '').trim()
}

/**
 * Parse AuctionData struct from a mapping response string.
 * Uses regex extraction for robustness against whitespace variations.
 */
export function parseAuctionData(raw: string, auctionId?: string): AuctionData {
  const extract = (field: string): string => {
    const regex = new RegExp(`${field}:\\s*([^,}]+)`)
    const match = raw.match(regex)
    return match ? match[1].trim() : ''
  }

  return {
    auction_id: auctionId || '',
    item_hash: parseField(extract('item_hash') || '0field'),
    seller_hash: parseField(extract('seller_hash') || '0field'),
    category: parseU8(extract('category') || '0u8'),
    token_type: parseU8(extract('token_type') || '1u8'),
    auction_mode: parseU8(extract('auction_mode') || '1u8'),
    status: parseU8(extract('status') || '0u8'),
    deadline: parseU64(extract('deadline') || '0u64'),
    reveal_deadline: parseU64(extract('reveal_deadline') || '0u64'),
    bid_count: parseU64(extract('bid_count') || '0u64'),
    reserve_price_hash: parseField(extract('reserve_price_hash') || '0field'),
    created_at: parseU64(extract('created_at') || '0u64'),
    dispute_deadline: parseU64(extract('dispute_deadline') || '0u64'),
  }
}

/** Map status number to phase string */
export function getPhase(status: number): AuctionPhase {
  const phases: Record<number, AuctionPhase> = {
    1: 'active',
    2: 'revealing',  // CLOSED — bidding done, reveal phase pending/active
    3: 'revealing',  // REVEALING — reveal phase active
    4: 'settled',
    5: 'cancelled',
    6: 'failed',
    7: 'disputed',
    8: 'expired',
  }
  return phases[status] || 'active'
}

/**
 * Format microcredits (u128 bigint) to human-readable amount.
 * 1 ALEO/USDCx = 1,000,000 microcredits
 */
export function formatAleoAmount(microcredits: bigint | string | number): string {
  let mc: bigint
  if (typeof microcredits === 'string') {
    const cleaned = microcredits.replace(/u128|u64/g, '').trim()
    try {
      mc = BigInt(cleaned)
    } catch {
      return '0'
    }
  } else if (typeof microcredits === 'number') {
    mc = BigInt(microcredits)
  } else {
    mc = microcredits
  }

  const whole = mc / 1_000_000n
  const frac = mc % 1_000_000n
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

/**
 * Format amount with token symbol.
 */
export function formatTokenAmount(amount: bigint | string | number, tokenType: number): string {
  const formatted = formatAleoAmount(amount)
  return tokenType === 2 ? `${formatted} USDCx` : `${formatted} ALEO`
}

/**
 * Convert a human-readable amount to microcredits string.
 */
export function toMicrocredits(amount: number): string {
  return Math.floor(amount * 1_000_000).toString()
}

/**
 * Approximate remaining time from block height difference.
 */
export function blockHeightToTime(
  targetBlock: number,
  currentHeight: number
): string {
  const remaining = targetBlock - currentHeight
  if (remaining <= 0) return 'Expired'

  const totalSeconds = remaining * config.blockTime
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `~${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    return `~${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `~${minutes}m`
  }
  return '< 1m'
}

/**
 * Convert a duration key to block count.
 */
export function durationToBlocks(durationKey: string): number {
  const map: Record<string, number> = {
    '1h': config.blocksPerHour,
    '6h': config.blocksPerHour * 6,
    '12h': config.blocksPerHour * 12,
    '24h': config.blocksPerHour * 24,
    '3d': config.blocksPerHour * 72,
    '7d': config.blocksPerHour * 168,
  }
  return map[durationKey] || config.blocksPerHour
}

/**
 * Shorten an Aleo address for display.
 */
export function shortenAddress(address: string, chars = 6): string {
  if (!address) return ''
  if (address.length <= chars * 2 + 3) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

/**
 * Truncate a field ID for display.
 */
export function truncateId(id: string, chars = 8): string {
  if (!id) return ''
  if (id.length <= chars * 2) return id
  return `${id.slice(0, chars)}...${id.slice(-chars)}`
}

/**
 * Generate a cryptographically random nonce as a field value.
 */
export function generateNonce(): string {
  const array = new Uint32Array(8)
  crypto.getRandomValues(array)
  let hex = ''
  for (const val of array) {
    hex += val.toString(16).padStart(8, '0')
  }
  const fieldOrder = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041')
  const bigVal = BigInt('0x' + hex) % fieldOrder
  return bigVal.toString() + 'field'
}

/**
 * Serialize a raw wallet record for use as a transaction input.
 * Wallet adaptors may return records with a `plaintext` string (preferred),
 * or as an object with a `data` sub-object. Falls back to JSON.stringify.
 */
export function serializeRecordForTx(rawRecord: Record<string, unknown>): string {
  // Prefer plaintext string (native Aleo record format)
  if (typeof rawRecord.plaintext === 'string') {
    return rawRecord.plaintext
  }
  // Some adaptors use serializedRecord
  if (typeof rawRecord.serializedRecord === 'string') {
    return rawRecord.serializedRecord
  }
  // Fallback: JSON stringify the whole record object
  return JSON.stringify(rawRecord)
}

/**
 * Simple string-to-field hash for title/description hashing.
 * NOTE: This is a JS-side hash used only for frontend display/identification.
 * The on-chain BHP256 hash is computed by the Leo program itself.
 * The item_hash passed to create_auction is this value, which the contract
 * stores directly (it does NOT re-hash it). So this is fine as a unique identifier.
 */
export function hashStringToField(input: string): string {
  const fieldOrder = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041')
  let hash = 0n
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31n + BigInt(input.charCodeAt(i))) % fieldOrder
  }
  return hash.toString() + 'field'
}

/**
 * Extract the auction_id from a confirmed create_auction transaction.
 *
 * create_auction returns `then finalize(auction_id, ...)` — no public/private outputs,
 * only a `future` output. The explorer API represents the future's value as a string
 * containing the finalize arguments. We parse the first field argument from that string.
 *
 * Also checks the top-level `finalize` array for mapping update keys as a fallback.
 */
export async function extractAuctionIdFromTx(txId: string): Promise<string | null> {
  const url = `${config.explorerApi}/${config.network}/transaction/${txId}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()

    // Navigate: execution.transitions
    const transitions = data?.execution?.transitions
    if (!Array.isArray(transitions) || transitions.length === 0) return null

    // Find the create_auction transition
    const createTx = transitions.find(
      (t: any) => t.program === config.programId && t.function === 'create_auction'
    ) || transitions[0]

    const outputs = createTx?.outputs
    if (Array.isArray(outputs)) {
      for (const output of outputs) {
        // Strategy 1: Direct public/private output (unlikely for create_auction, but safe)
        if ((output.type === 'public' || output.type === 'private') && typeof output.value === 'string') {
          if (output.value.endsWith('field')) {
            return output.value.replace(/field$/, '')
          }
        }

        // Strategy 2: Parse the future output's value for finalize arguments
        // The future value contains: "{ program_id: ..., function_name: ..., arguments: [ auction_id_field, ... ] }"
        if (output.type === 'future' && typeof output.value === 'string') {
          // Extract all field values from the future string
          const fieldMatches = output.value.match(/(\d+)field/g)
          if (fieldMatches && fieldMatches.length > 0) {
            // First field argument is auction_id
            return fieldMatches[0].replace(/field$/, '')
          }
        }
      }
    }

    // Strategy 3: Check finalize mapping operations for the auction_id key
    // Confirmed transactions may include finalize results showing mapping updates
    const finalize = data?.finalize || createTx?.finalize
    if (Array.isArray(finalize)) {
      for (const ops of finalize) {
        const entries = Array.isArray(ops) ? ops : [ops]
        for (const entry of entries) {
          if (typeof entry?.key === 'string' && entry.key.endsWith('field')) {
            return entry.key.replace(/field$/, '')
          }
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Fetch settlement proof for a settled auction.
 * Returns the on-chain BHP256 hash of the SettlementProof struct.
 * Any third party can verify auction integrity by recomputing:
 * BHP256(auction_id, highest_bid, second_highest, winner_bid_hash, settled_at)
 */
export async function fetchSettlementProof(auctionId: string): Promise<string | null> {
  const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`
  return fetchMapping('settlement_proofs', key)
}

/**
 * Fetch payment proof for a settled auction.
 * Returns the on-chain BHP256::commit_to_field(amount, nonce_scalar) value.
 * The winner can verify their payment by reproducing:
 * commit(bid_amount as field, BHP256::hash_to_scalar(bid_nonce))
 */
export async function fetchPaymentProof(auctionId: string): Promise<string | null> {
  const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`
  return fetchMapping('payment_proofs', key)
}

/**
 * Poll for a confirmed transaction and extract the auction_id from outputs.
 * Retries up to maxAttempts times with intervalMs delay.
 */
export function pollForAuctionId(
  txId: string,
  onFound: (auctionId: string) => void,
  maxAttempts = 40,
  intervalMs = 3000
): () => void {
  let attempts = 0
  const timer = setInterval(async () => {
    attempts++
    if (attempts > maxAttempts) {
      clearInterval(timer)
      return
    }
    const auctionId = await extractAuctionIdFromTx(txId)
    if (auctionId) {
      clearInterval(timer)
      onFound(auctionId)
    }
  }, intervalMs)

  return () => clearInterval(timer)
}

/**
 * Fetch the user's public USDCx balance from on-chain mapping.
 * USDCx uses public balances (transfer_public_as_signer), so we can
 * read the account mapping directly from the explorer API.
 * Returns balance in microcredits (u128), or 0 if not found.
 */
export async function fetchUsdcxBalance(address: string): Promise<bigint> {
  try {
    const raw = await fetchMapping('account', address, config.usdcxProgramId)
    if (!raw) return 0n
    // Value format: "1000000u128" or just a number
    const cleaned = raw.replace(/u128\s*$/, '').replace(/"/g, '').trim()
    return BigInt(cleaned)
  } catch {
    return 0n
  }
}

/**
 * Fetch a credits.aleo/credits record with sufficient balance for a transaction.
 * Uses the wallet adapter's requestRecords to find unspent records.
 * Returns the plaintext string ready to pass as a transaction input.
 */
export async function fetchCreditsRecord(
  requestRecords: (programId: string, withPlaintext?: boolean) => Promise<unknown>,
  minAmountMicro: number
): Promise<string | null> {
  try {
    const records = await requestRecords('credits.aleo')
    const recordsArr = Array.isArray(records) ? records : []

    for (const raw of recordsArr) {
      const record = raw as Record<string, unknown>

      // Skip spent records
      if (record.spent === true || record.is_spent === true) continue

      // Try to get plaintext
      let plaintext: string | null = null

      if (typeof raw === 'string' && (raw as string).includes('microcredits')) {
        plaintext = raw as string
      } else if (typeof record.plaintext === 'string' && record.plaintext.includes('microcredits')) {
        plaintext = record.plaintext
      } else if (typeof record.data === 'string' && record.data.includes('microcredits')) {
        plaintext = record.data
      } else if (record.data && typeof record.data === 'object') {
        // Try to reconstruct from data fields
        const data = record.data as Record<string, unknown>
        const rawNonce = record.nonce || record._nonce || data._nonce
        if (rawNonce && data.microcredits && record.owner) {
          const mc = String(data.microcredits).replace(/u64.*$/, '').replace(/[^0-9]/g, '')
          const owner = String(record.owner).replace(/\.private$/, '')
          const nonce = String(rawNonce).replace(/\.public$/, '').replace(/group$/, '')
          plaintext = `{ owner: ${owner}.private, microcredits: ${mc}u64.private, _nonce: ${nonce}group.public }`
        }
      }

      if (!plaintext) continue

      // Parse microcredits value
      const mcMatch = plaintext.match(/microcredits\s*:\s*(\d+)u64/)
      if (!mcMatch) continue

      const mc = parseInt(mcMatch[1], 10)
      if (mc >= minAmountMicro) {
        return plaintext
      }
    }

    return null
  } catch {
    return null
  }
}
