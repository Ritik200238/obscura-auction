import { EXPLORER_API, TESTNET_NETWORK, STATUS_LABELS, TOKEN_LABELS, MODE_LABELS } from './constants.js';
import type { AuctionData, DutchConfig, ParsedAuction } from './types.js';

const FIELD_MODULUS = 8444461749428370424248824938781546531375899335154063827935233455917409239041n;

/**
 * Polynomial hash of a string to a field element.
 * Matches the frontend's hashStringToField used for item_hash derivation.
 */
export function hashStringToField(input: string): string {
  let hash = 0n;
  const prime = 31n;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * prime + BigInt(input.charCodeAt(i))) % FIELD_MODULUS;
  }
  return `${hash}field`;
}

/**
 * Generate a cryptographically random nonce as a field string.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  value = value % FIELD_MODULUS;
  return `${value}field`;
}

/**
 * Convert a human-readable token amount (e.g. 1.5) to microcredits (1500000).
 */
export function toMicrocredits(amount: number): string {
  return `${Math.floor(amount * 1_000_000)}u128`;
}

/**
 * Convert microcredits to human-readable amount.
 */
export function fromMicrocredits(micros: bigint | number): number {
  return Number(micros) / 1_000_000;
}

/**
 * Format a truncated auction/tx ID for display.
 */
export function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars)}...${id.slice(-chars)}`;
}

/**
 * Compute the current Dutch auction price at a given block height.
 * Pure computation — no network calls needed.
 */
export function computeDutchPrice(
  config: DutchConfig,
  createdAt: number,
  deadline: number,
  currentBlock: number
): bigint {
  if (currentBlock >= deadline) return config.end_price;
  if (currentBlock <= createdAt) return config.start_price;

  const elapsed = BigInt(currentBlock - createdAt);
  const totalDuration = BigInt(deadline - createdAt);
  const priceRange = config.start_price - config.end_price;
  const priceDrop = (priceRange * elapsed) / totalDuration;
  return config.start_price - priceDrop;
}

/**
 * Fetch a mapping value from the Aleo explorer API.
 */
export async function fetchMapping(
  mappingName: string,
  key: string,
  programId: string,
  endpoint = EXPLORER_API,
  network = TESTNET_NETWORK
): Promise<string | null> {
  const url = `${endpoint}/${network}/program/${programId}/mapping/${mappingName}/${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text === 'null') return null;
  return text;
}

/**
 * Parse a raw Aleo mapping value string into an AuctionData object.
 * Handles the format: { field1: value1, field2: value2, ... }
 */
export function parseAuctionData(raw: string, auctionId: string): ParsedAuction {
  const clean = raw.replace(/\s+/g, ' ').trim();

  const extractField = (name: string): string => {
    const regex = new RegExp(`${name}:\\s*([^,}]+)`);
    const match = clean.match(regex);
    return match ? match[1].trim() : '';
  };

  const stripSuffix = (val: string): string =>
    val.replace(/u8$|u64$|u128$|u32$|field$|bool$/, '').trim();

  const status = Number(stripSuffix(extractField('status')));

  const data: AuctionData = {
    item_hash: extractField('item_hash'),
    seller_hash: extractField('seller_hash'),
    category: Number(stripSuffix(extractField('category'))),
    token_type: Number(stripSuffix(extractField('token_type'))),
    auction_mode: Number(stripSuffix(extractField('auction_mode'))),
    status,
    deadline: Number(stripSuffix(extractField('deadline'))),
    reveal_deadline: Number(stripSuffix(extractField('reveal_deadline'))),
    bid_count: Number(stripSuffix(extractField('bid_count'))),
    reserve_price_hash: extractField('reserve_price_hash'),
    created_at: Number(stripSuffix(extractField('created_at'))),
    dispute_deadline: Number(stripSuffix(extractField('dispute_deadline'))),
  };

  return {
    ...data,
    auction_id: auctionId,
    phase: (STATUS_LABELS[status] ?? 'active') as ParsedAuction['phase'],
    mode_label: MODE_LABELS[data.auction_mode] ?? 'Unknown',
    token_label: TOKEN_LABELS[data.token_type] ?? 'Unknown',
    status_label: STATUS_LABELS[status] ?? 'Unknown',
  };
}

/**
 * Parse a raw DutchConfig mapping value.
 */
export function parseDutchConfig(raw: string): DutchConfig {
  const clean = raw.replace(/\s+/g, ' ').trim();
  const extract = (name: string): bigint => {
    const regex = new RegExp(`${name}:\\s*(\\d+)u128`);
    const match = clean.match(regex);
    return match ? BigInt(match[1]) : 0n;
  };
  return {
    start_price: extract('start_price'),
    end_price: extract('end_price'),
  };
}

/**
 * Fetch the current block height from the explorer API.
 */
export async function fetchBlockHeight(
  endpoint = EXPLORER_API,
  network = TESTNET_NETWORK
): Promise<number> {
  const res = await fetch(`${endpoint}/${network}/block/height/latest`);
  if (!res.ok) throw new Error(`Failed to fetch block height: ${res.status}`);
  const height = await res.text();
  return Number(height);
}
