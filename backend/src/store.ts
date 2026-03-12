import { encrypt, decrypt, hmacHash } from './encryption';
import { logger } from './logger';
import { useSupabase, getSupabase } from './supabase';

// --- Interfaces (unchanged — routes depend on these) ---

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

// --- Status mapping (matches contract) ---

const STATUS_CODE_MAP: Record<number, string> = {
  1: 'active', 2: 'closed', 3: 'revealing', 4: 'settled',
  5: 'cancelled', 6: 'failed', 7: 'disputed', 8: 'expired',
};

const STATUS_NAME_MAP: Record<string, number> = Object.fromEntries(
  Object.entries(STATUS_CODE_MAP).map(([k, v]) => [v, Number(k)])
);

// --- Event sourcing helper ---

async function logEvent(
  auctionId: string,
  eventType: string,
  eventData: Record<string, any>,
  txId?: string,
): Promise<void> {
  if (!useSupabase) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('auction_events').insert({
      auction_id: auctionId,
      event_type: eventType,
      event_data: eventData,
      transaction_id: txId || null,
    });
  } catch (err) {
    logger.error(`Failed to log event ${eventType} for ${auctionId.slice(0, 16)}:`, err);
  }
}

// --- Supabase row ↔ AuctionRecord converters ---

function dbRowToAuction(row: any): AuctionRecord {
  return {
    auction_id: row.auction_id,
    title: row.title ? decrypt(row.title, 'auctions', 'title') : '',
    description: row.description ? decrypt(row.description, 'auctions', 'description') : '',
    seller_address_encrypted: row.seller_hash || '',
    tx_id: row.settlement_tx || '',
    created_at: row.created_at,
    status: STATUS_CODE_MAP[row.current_status] || 'active',
    bid_count: row.bid_count || 0,
    deadline: row.deadline ? Number(row.deadline) : undefined,
    reserve_price_hash: row.reserve_price_hash || undefined,
    token_type: row.token_type === 2 ? 'USDCx' : 'ALEO',
    highest_bid: row.winning_bid ? Number(row.winning_bid) : undefined,
    second_highest_bid: row.second_price ? Number(row.second_price) : undefined,
    winner_hash: undefined,
    last_synced: row.updated_at,
  };
}

function dbRowToBid(row: any): BidRecord {
  return {
    auction_id: row.auction_id,
    bidder_address_encrypted: row.bidder_hash || '',
    bid_hash: row.bid_hash,
    tx_id: row.transaction_id || '',
    created_at: row.created_at,
    revealed: row.status === 'revealed',
    revealed_amount: row.revealed_amount ? Number(row.revealed_amount) : undefined,
  };
}

// =====================================================================
// Filesystem fallback (kept from original for local dev without Supabase)
// =====================================================================

import fs from 'fs';
import path from 'path';

const isVercel = !!(process.env.VERCEL === '1' || process.env.VERCEL_ENV);
const DATA_DIR = isVercel ? '/tmp/obscura-data' : path.join(__dirname, '..', 'data');
const AUCTIONS_FILE = path.join(DATA_DIR, 'auctions.json');
const BIDS_FILE = path.join(DATA_DIR, 'bids.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch { /* Silently fail */ }
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
  const tmpFile = path.join(path.dirname(filePath), `.obscura_${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

// =====================================================================
// Public API — each function checks useSupabase, falls back to filesystem
// =====================================================================

// --- Auctions ---

export async function getAllAuctions(): Promise<AuctionRecord[]> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('auctions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        logger.error('Supabase getAllAuctions failed:', error.message);
      } else if (data) {
        return data.map(dbRowToAuction);
      }
    }
  }
  return readJsonFileSync<AuctionRecord>(AUCTIONS_FILE);
}

export async function getAuctionById(auctionId: string): Promise<AuctionRecord | undefined> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('auctions')
        .select('*')
        .eq('auction_id', auctionId)
        .maybeSingle();
      if (error) {
        logger.error('Supabase getAuctionById failed:', error.message);
      } else if (data) {
        return dbRowToAuction(data);
      }
      return undefined;
    }
  }
  const auctions = readJsonFileSync<AuctionRecord>(AUCTIONS_FILE);
  return auctions.find((a) => a.auction_id === auctionId);
}

export async function getAuctionsBySeller(sellerAddress: string): Promise<AuctionRecord[]> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const addressHash = hmacHash(sellerAddress, 'auctions', 'seller_address');
      const { data, error } = await sb
        .from('auctions')
        .select('*')
        .eq('seller_address_hash', addressHash)
        .order('created_at', { ascending: false });
      if (error) {
        logger.error('Supabase getAuctionsBySeller failed:', error.message);
      } else if (data) {
        return data.map(dbRowToAuction);
      }
      return [];
    }
  }
  const auctions = readJsonFileSync<AuctionRecord>(AUCTIONS_FILE);
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
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      // Check for duplicate
      const { data: existing } = await sb
        .from('auctions')
        .select('auction_id')
        .eq('auction_id', params.auction_id)
        .maybeSingle();
      if (existing) {
        throw new Error(`Auction ${params.auction_id} already exists`);
      }

      const encTitle = encrypt(params.title, 'auctions', 'title');
      const encDesc = encrypt(params.description || '', 'auctions', 'description');
      const encSeller = encrypt(params.seller_address, 'auctions', 'seller_address');
      const sellerHash = hmacHash(params.seller_address, 'auctions', 'seller_address');

      const row = {
        auction_id: params.auction_id,
        title: encTitle,
        description: encDesc,
        seller_hash: encSeller,
        seller_address_hash: sellerHash,
        settlement_tx: params.tx_id,
        current_status: 1,
        token_type: params.token_type || 1,
        bid_count: 0,
        deadline: params.deadline || null,
      };

      const { error } = await sb.from('auctions').insert(row);
      if (error) throw new Error(`Supabase insert failed: ${error.message}`);

      await logEvent(params.auction_id, 'auction_created', {
        title: params.title,
        token_type: params.token_type || 1,
        deadline: params.deadline,
      }, params.tx_id);

      logger.info(`Auction created (Supabase): ${params.auction_id.slice(0, 16)}...`);

      return {
        auction_id: params.auction_id,
        title: params.title,
        description: params.description,
        seller_address_encrypted: encSeller,
        tx_id: params.tx_id,
        created_at: new Date().toISOString(),
        status: 'active',
        token_type: params.token_type === 2 ? 'USDCx' : 'ALEO',
        deadline: params.deadline,
        bid_count: 0,
      };
    }
  }

  // --- Filesystem fallback ---
  const auctions = readJsonFileSync<AuctionRecord>(AUCTIONS_FILE);
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
  writeJsonFileSync(AUCTIONS_FILE, auctions);
  logger.info(`Auction created: ${params.auction_id.slice(0, 16)}...`);
  return record;
}

export async function updateAuction(
  auctionId: string,
  updates: Partial<AuctionRecord>,
): Promise<AuctionRecord | null> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      // Map AuctionRecord fields → DB columns
      const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };

      if (updates.status !== undefined) {
        dbUpdates.current_status = STATUS_NAME_MAP[updates.status] ?? 1;
      }
      if (updates.bid_count !== undefined) dbUpdates.bid_count = updates.bid_count;
      if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;
      if (updates.highest_bid !== undefined) dbUpdates.winning_bid = updates.highest_bid;
      if (updates.second_highest_bid !== undefined) dbUpdates.second_price = updates.second_highest_bid;
      if (updates.winner_hash !== undefined) {
        // Store in event data, not a column
      }
      if (updates.token_type !== undefined) {
        dbUpdates.token_type = updates.token_type === 'USDCx' ? 2 : 1;
      }
      if (updates.reserve_price_hash !== undefined) {
        dbUpdates.reserve_price_hash = updates.reserve_price_hash;
      }

      const { data, error } = await sb
        .from('auctions')
        .update(dbUpdates)
        .eq('auction_id', auctionId)
        .select()
        .maybeSingle();

      if (error) {
        logger.error(`Supabase updateAuction failed for ${auctionId.slice(0, 16)}:`, error.message);
        return null;
      }

      await logEvent(auctionId, 'auction_updated', updates);

      return data ? dbRowToAuction(data) : null;
    }
  }

  // --- Filesystem fallback ---
  const auctions = readJsonFileSync<AuctionRecord>(AUCTIONS_FILE);
  const idx = auctions.findIndex((a) => a.auction_id === auctionId);
  if (idx === -1) return null;

  auctions[idx] = { ...auctions[idx], ...updates };
  writeJsonFileSync(AUCTIONS_FILE, auctions);
  return auctions[idx];
}

// --- Bids ---

export async function getAllBids(): Promise<BidRecord[]> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('bids')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        logger.error('Supabase getAllBids failed:', error.message);
      } else if (data) {
        return data.map(dbRowToBid);
      }
    }
  }
  return readJsonFileSync<BidRecord>(BIDS_FILE);
}

export async function getBidsByAuction(auctionId: string): Promise<BidRecord[]> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('bids')
        .select('*')
        .eq('auction_id', auctionId)
        .order('created_at', { ascending: false });
      if (error) {
        logger.error('Supabase getBidsByAuction failed:', error.message);
      } else if (data) {
        return data.map(dbRowToBid);
      }
      return [];
    }
  }
  const bids = readJsonFileSync<BidRecord>(BIDS_FILE);
  return bids.filter((b) => b.auction_id === auctionId);
}

export async function getBidsByBidder(bidderAddress: string): Promise<BidRecord[]> {
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const addressHash = hmacHash(bidderAddress, 'bids', 'bidder_address');
      const { data, error } = await sb
        .from('bids')
        .select('*')
        .eq('bidder_address_hash', addressHash)
        .order('created_at', { ascending: false });
      if (error) {
        logger.error('Supabase getBidsByBidder failed:', error.message);
      } else if (data) {
        return data.map(dbRowToBid);
      }
      return [];
    }
  }
  const bids = readJsonFileSync<BidRecord>(BIDS_FILE);
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
  if (useSupabase) {
    const sb = getSupabase();
    if (sb) {
      const encBidder = encrypt(params.bidder_address, 'bids', 'bidder_address');
      const bidderHash = hmacHash(params.bidder_address, 'bids', 'bidder_address');

      const row = {
        auction_id: params.auction_id,
        bid_hash: params.bid_hash,
        commitment: params.bid_hash,
        bidder_hash: encBidder,
        bidder_address_hash: bidderHash,
        status: 'sealed',
        transaction_id: params.tx_id,
      };

      const { error } = await sb.from('bids').insert(row);
      if (error) throw new Error(`Supabase bid insert failed: ${error.message}`);

      // Increment bid_count on the auction
      const { data: auction } = await sb
        .from('auctions')
        .select('bid_count')
        .eq('auction_id', params.auction_id)
        .maybeSingle();
      if (auction) {
        await sb
          .from('auctions')
          .update({ bid_count: (auction.bid_count || 0) + 1, updated_at: new Date().toISOString() })
          .eq('auction_id', params.auction_id);
      }

      await logEvent(params.auction_id, 'bid_placed', {
        bid_hash: params.bid_hash,
      }, params.tx_id);

      logger.info(`Bid registered (Supabase) for auction ${params.auction_id.slice(0, 16)}...`);

      return {
        auction_id: params.auction_id,
        bidder_address_encrypted: encBidder,
        bid_hash: params.bid_hash,
        tx_id: params.tx_id,
        created_at: new Date().toISOString(),
        revealed: false,
      };
    }
  }

  // --- Filesystem fallback ---
  const bids = readJsonFileSync<BidRecord>(BIDS_FILE);

  const record: BidRecord = {
    auction_id: params.auction_id,
    bidder_address_encrypted: encrypt(params.bidder_address, 'bids', 'bidder_address'),
    bid_hash: params.bid_hash,
    tx_id: params.tx_id,
    created_at: new Date().toISOString(),
    revealed: false,
  };

  bids.push(record);
  writeJsonFileSync(BIDS_FILE, bids);
  logger.info(`Bid registered for auction ${params.auction_id.slice(0, 16)}...`);
  return record;
}

// --- Event sourcing queries (Supabase only, return empty for filesystem) ---

export async function getAuctionEvents(auctionId: string, limit = 50): Promise<any[]> {
  if (!useSupabase) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('auction_events')
    .select('*')
    .eq('auction_id', auctionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('getAuctionEvents failed:', error.message);
    return [];
  }
  return data || [];
}

export async function getRecentActivity(limit = 50): Promise<any[]> {
  if (!useSupabase) return [];
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('auction_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('getRecentActivity failed:', error.message);
    return [];
  }
  return data || [];
}

export async function getOverviewStats(): Promise<{
  total_auctions: number;
  total_bids: number;
  active_auctions: number;
  settled_auctions: number;
}> {
  if (!useSupabase) {
    // Filesystem fallback: compute from JSON files
    const auctions = readJsonFileSync<AuctionRecord>(AUCTIONS_FILE);
    const bids = readJsonFileSync<BidRecord>(BIDS_FILE);
    return {
      total_auctions: auctions.length,
      total_bids: bids.length,
      active_auctions: auctions.filter((a) => a.status === 'active').length,
      settled_auctions: auctions.filter((a) => a.status === 'settled').length,
    };
  }

  const sb = getSupabase();
  if (!sb) {
    return { total_auctions: 0, total_bids: 0, active_auctions: 0, settled_auctions: 0 };
  }

  const [auctionsRes, bidsRes, activeRes, settledRes] = await Promise.all([
    sb.from('auctions').select('*', { count: 'exact', head: true }),
    sb.from('bids').select('*', { count: 'exact', head: true }),
    sb.from('auctions').select('*', { count: 'exact', head: true }).eq('current_status', 1),
    sb.from('auctions').select('*', { count: 'exact', head: true }).eq('current_status', 4),
  ]);

  return {
    total_auctions: auctionsRes.count || 0,
    total_bids: bidsRes.count || 0,
    active_auctions: activeRes.count || 0,
    settled_auctions: settledRes.count || 0,
  };
}

// --- Storage type indicator ---

export function getStorageType(): 'supabase' | 'filesystem' {
  return useSupabase ? 'supabase' : 'filesystem';
}
