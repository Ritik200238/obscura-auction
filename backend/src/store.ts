import fs from 'fs';
import os from 'os';
import path from 'path';
import { encrypt, decrypt } from './encryption';

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUCTIONS_FILE = path.join(DATA_DIR, 'auctions.json');
const BIDS_FILE = path.join(DATA_DIR, 'bids.json');

// Simple write lock to prevent concurrent file corruption
const writeLocks = new Map<string, Promise<void>>();
async function withLock<T>(file: string, fn: () => T): Promise<T> {
  const prev = writeLocks.get(file) || Promise.resolve();
  const next = prev.then(() => fn());
  writeLocks.set(file, next.then(() => {}, () => {}));
  return next;
}

export interface AuctionRecord {
  auction_id: string;
  title: string;
  description: string;
  seller_address_encrypted: string;
  tx_id: string;
  created_at: string;
  // On-chain synced fields
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

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string): T[] {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf8');
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeJsonFile<T>(filePath: string, data: T[]): void {
  ensureDataDir();
  // Atomic write: write to temp file then rename (prevents corruption on crash)
  const tmpFile = path.join(os.tmpdir(), `obscura_${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

// --- Auctions ---

export function getAllAuctions(): AuctionRecord[] {
  return readJsonFile<AuctionRecord>(AUCTIONS_FILE);
}

export function getAuctionById(auctionId: string): AuctionRecord | undefined {
  const auctions = getAllAuctions();
  return auctions.find((a) => a.auction_id === auctionId);
}

export function getAuctionsBySeller(sellerAddress: string): AuctionRecord[] {
  const auctions = getAllAuctions();
  return auctions.filter((a) => {
    try {
      const decrypted = decrypt(a.seller_address_encrypted, 'auctions', 'seller_address');
      return decrypted === sellerAddress;
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
  return withLock(AUCTIONS_FILE, () => {
    const auctions = getAllAuctions();

    // Check for duplicate
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
    writeJsonFile(AUCTIONS_FILE, auctions);
    return record;
  });
}

export async function updateAuction(auctionId: string, updates: Partial<AuctionRecord>): Promise<AuctionRecord | null> {
  return withLock(AUCTIONS_FILE, () => {
    const auctions = getAllAuctions();
    const idx = auctions.findIndex((a) => a.auction_id === auctionId);
    if (idx === -1) return null;

    auctions[idx] = { ...auctions[idx], ...updates };
    writeJsonFile(AUCTIONS_FILE, auctions);
    return auctions[idx];
  });
}

// --- Bids ---

export function getAllBids(): BidRecord[] {
  return readJsonFile<BidRecord>(BIDS_FILE);
}

export function getBidsByAuction(auctionId: string): BidRecord[] {
  const bids = getAllBids();
  return bids.filter((b) => b.auction_id === auctionId);
}

export function getBidsByBidder(bidderAddress: string): BidRecord[] {
  const bids = getAllBids();
  return bids.filter((b) => {
    try {
      const decrypted = decrypt(b.bidder_address_encrypted, 'bids', 'bidder_address');
      return decrypted === bidderAddress;
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
  return withLock(BIDS_FILE, () => {
    const bids = getAllBids();

    const record: BidRecord = {
      auction_id: params.auction_id,
      bidder_address_encrypted: encrypt(params.bidder_address, 'bids', 'bidder_address'),
      bid_hash: params.bid_hash,
      tx_id: params.tx_id,
      created_at: new Date().toISOString(),
      revealed: false,
    };

    bids.push(record);
    writeJsonFile(BIDS_FILE, bids);
    return record;
  });
}

export async function updateBid(auctionId: string, bidHash: string, updates: Partial<BidRecord>): Promise<BidRecord | null> {
  return withLock(BIDS_FILE, () => {
    const bids = getAllBids();
    const idx = bids.findIndex((b) => b.auction_id === auctionId && b.bid_hash === bidHash);
    if (idx === -1) return null;

    bids[idx] = { ...bids[idx], ...updates };
    writeJsonFile(BIDS_FILE, bids);
    return bids[idx];
  });
}
