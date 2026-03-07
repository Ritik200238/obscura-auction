import { encrypt, decrypt } from './encryption';

// --- Storage backend detection ---
// Use Redis (Upstash) on Vercel, filesystem for local dev
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = !!(REDIS_URL && REDIS_TOKEN);

if (useRedis) {
  console.log('[store] Using Upstash Redis for persistent storage');
} else {
  console.log('[store] No Redis credentials found — using filesystem storage');
}

// --- Redis client (lazy-initialized) ---
let redis: any = null;
function getRedis(): any {
  if (!redis && useRedis) {
    // Dynamic require to avoid crash if @upstash/redis has issues
    try {
      const { Redis } = require('@upstash/redis');
      redis = new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! });
    } catch (err) {
      console.error('[store] Failed to initialize Redis:', err);
      return null;
    }
  }
  return redis;
}

// --- Filesystem fallback (local dev) ---
import fs from 'fs';
import os from 'os';
import path from 'path';

// On Vercel, use /tmp (only writable dir). Locally use ./data
const isVercel = !!(process.env.VERCEL === '1' || process.env.VERCEL_ENV);
const DATA_DIR = isVercel ? '/tmp/obscura-data' : path.join(__dirname, '..', 'data');
const AUCTIONS_FILE = path.join(DATA_DIR, 'auctions.json');
const BIDS_FILE = path.join(DATA_DIR, 'bids.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Silently fail — Redis should be primary on Vercel
  }
}

function readJsonFileSync<T>(filePath: string): T[] {
  try { ensureDataDir(); } catch { return []; }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T[];
  } catch {
    return [];
  }
}

function writeJsonFileSync<T>(filePath: string, data: T[]): void {
  ensureDataDir();
  const tmpFile = path.join(os.tmpdir(), `obscura_${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

// --- Generic storage layer ---
const AUCTIONS_KEY = 'obscura:auctions';
const BIDS_KEY = 'obscura:bids';

async function readStore<T>(redisKey: string, filePath: string): Promise<T[]> {
  if (useRedis) {
    try {
      const client = getRedis();
      if (client) {
        const data = await client.get(redisKey);
        if (data) return (typeof data === 'string' ? JSON.parse(data) : data) as T[];
        return [];
      }
    } catch (err) {
      console.error(`[store] Redis read failed for ${redisKey}, falling back to fs:`, err);
    }
  }
  return readJsonFileSync<T>(filePath);
}

async function writeStore<T>(redisKey: string, filePath: string, data: T[]): Promise<void> {
  if (useRedis) {
    try {
      const client = getRedis();
      if (client) {
        await client.set(redisKey, JSON.stringify(data));
        return;
      }
    } catch (err) {
      console.error(`[store] Redis write failed for ${redisKey}, falling back to fs:`, err);
    }
  }
  writeJsonFileSync(filePath, data);
}

// --- Interfaces ---

export interface AuctionRecord {
  auction_id: string;
  title: string;
  description: string;
  seller_address_encrypted: string;
  tx_id: string;
  created_at: string;
  status?: string;
  bid_count?: number;
  deadline?: number;
  reserve_price_hash?: string;
  token_type?: string;
  highest_bid?: number;
  second_highest_bid?: number;
  winner_hash?: string;
  last_synced?: string;
}

export interface BidRecord {
  auction_id: string;
  bidder_address_encrypted: string;
  bid_hash: string;
  tx_id: string;
  created_at: string;
  revealed?: boolean;
  revealed_amount?: number;
}

// --- Auctions ---

export async function getAllAuctions(): Promise<AuctionRecord[]> {
  return readStore<AuctionRecord>(AUCTIONS_KEY, AUCTIONS_FILE);
}

export async function getAuctionById(auctionId: string): Promise<AuctionRecord | undefined> {
  const auctions = await getAllAuctions();
  return auctions.find((a) => a.auction_id === auctionId);
}

export async function getAuctionsBySeller(sellerAddress: string): Promise<AuctionRecord[]> {
  const auctions = await getAllAuctions();
  return auctions.filter((a) => {
    try {
      return decrypt(a.seller_address_encrypted, 'auctions', 'seller_address') === sellerAddress;
    } catch {
      return false;
    }
  });
}

export async function createAuction(params: {
  auction_id: string;
  title: string;
  description: string;
  seller_address: string;
  tx_id: string;
  token_type?: number;
  deadline?: number;
}): Promise<AuctionRecord> {
  const auctions = await getAllAuctions();

  if (auctions.find((a) => a.auction_id === params.auction_id)) {
    throw new Error(`Auction ${params.auction_id} already exists`);
  }

  const record: AuctionRecord = {
    auction_id: params.auction_id,
    title: params.title,
    description: params.description,
    seller_address_encrypted: encrypt(params.seller_address, 'auctions', 'seller_address'),
    tx_id: params.tx_id,
    created_at: new Date().toISOString(),
    status: 'active',
    token_type: params.token_type === 2 ? 'USDCx' : 'ALEO',
    deadline: params.deadline,
    bid_count: 0,
  };

  auctions.push(record);
  await writeStore(AUCTIONS_KEY, AUCTIONS_FILE, auctions);
  return record;
}

export async function updateAuction(auctionId: string, updates: Partial<AuctionRecord>): Promise<AuctionRecord | null> {
  const auctions = await getAllAuctions();
  const idx = auctions.findIndex((a) => a.auction_id === auctionId);
  if (idx === -1) return null;

  auctions[idx] = { ...auctions[idx], ...updates };
  await writeStore(AUCTIONS_KEY, AUCTIONS_FILE, auctions);
  return auctions[idx];
}

// --- Bids ---

export async function getAllBids(): Promise<BidRecord[]> {
  return readStore<BidRecord>(BIDS_KEY, BIDS_FILE);
}

export async function getBidsByAuction(auctionId: string): Promise<BidRecord[]> {
  const bids = await getAllBids();
  return bids.filter((b) => b.auction_id === auctionId);
}

export async function getBidsByBidder(bidderAddress: string): Promise<BidRecord[]> {
  const bids = await getAllBids();
  return bids.filter((b) => {
    try {
      return decrypt(b.bidder_address_encrypted, 'bids', 'bidder_address') === bidderAddress;
    } catch {
      return false;
    }
  });
}

export async function createBid(params: {
  auction_id: string;
  bidder_address: string;
  bid_hash: string;
  tx_id: string;
}): Promise<BidRecord> {
  const bids = await getAllBids();

  const record: BidRecord = {
    auction_id: params.auction_id,
    bidder_address_encrypted: encrypt(params.bidder_address, 'bids', 'bidder_address'),
    bid_hash: params.bid_hash,
    tx_id: params.tx_id,
    created_at: new Date().toISOString(),
    revealed: false,
  };

  bids.push(record);
  await writeStore(BIDS_KEY, BIDS_FILE, bids);
  return record;
}

export async function updateBid(auctionId: string, bidHash: string, updates: Partial<BidRecord>): Promise<BidRecord | null> {
  const bids = await getAllBids();
  const idx = bids.findIndex((b) => b.auction_id === auctionId && b.bid_hash === bidHash);
  if (idx === -1) return null;

  bids[idx] = { ...bids[idx], ...updates };
  await writeStore(BIDS_KEY, BIDS_FILE, bids);
  return bids[idx];
}
