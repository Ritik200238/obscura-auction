import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { fetchMapping, fetchTransaction } from '../explorer';
import { logger } from '../logger';
import {
  getAllAuctions,
  getAuctionById,
  createAuction,
  getBidsByAuction,
  createBid,
  getOverviewStats,
  getRecentActivity,
  getAuctionEvents,
  getStorageType,
} from '../store';
import { syncAllAuctions } from '../sync';
import { paginate } from '../utils';

/** Strip HTML/script tags from user-supplied strings to prevent stored XSS */
function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')      // strip HTML tags
    .replace(/javascript:/gi, '') // strip JS protocol
    .replace(/on\w+\s*=/gi, '')   // strip event handlers
    .trim();
}

/** Verify that a transaction ID actually exists on the Aleo explorer.
 *  Best-effort: returns false on network error (caller decides whether to block). */
async function verifyTxExists(txId: string): Promise<boolean> {
  try {
    const data = await fetchTransaction(txId);
    return !!data;
  } catch {
    return false; // explorer unreachable — don't block the request
  }
}

const router = Router();

// Per-route rate limiters (attached inline to mutating routes)
const createAuctionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auction creations. Maximum 5 per hour.' },
});

const bidLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bid submissions. Maximum 20 per hour.' },
});

// GET /api/auctions — list all auctions (paginated)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Sync is best-effort — don't block serving cached data if explorer is down
    try { await syncAllAuctions(); } catch (err) {
      logger.warn('Sync failed, returning cached data:', err);
    }
    const auctions = await getAllAuctions();

    // Return public-safe view (strip encrypted fields)
    const safeAuctions = auctions.map((a) => ({
      auction_id: a.auction_id,
      title: a.title,
      description: a.description,
      tx_id: a.tx_id,
      created_at: a.created_at,
      status: a.status || 'pending',
      bid_count: a.bid_count || 0,
      deadline: a.deadline,
      token_type: a.token_type,
      highest_bid: a.highest_bid,
      second_highest_bid: a.second_highest_bid,
      last_synced: a.last_synced,
    }));

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const result = paginate(safeAuctions, page, limit);

    res.json({ auctions: result.data, total: result.total, page: result.page, limit: result.limit });
  } catch (err) {
    logger.error('GET /api/auctions failed:', err);
    res.status(500).json({ error: 'Failed to fetch auctions' });
  }
});

// GET /api/auctions/:id — single auction with on-chain merge
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const auction = await getAuctionById(id);

    if (!auction) {
      res.status(404).json({ error: 'Auction not found' });
      return;
    }

    // Try to fetch latest on-chain data
    let onChainData: string | null = null;
    try {
      const key = id.endsWith('field') ? id : `${id}field`;
      onChainData = await fetchMapping('auctions', key);
    } catch {
      // On-chain fetch is best-effort
    }

    // Fetch tx details if available
    let txDetails: any = null;
    if (auction.tx_id) {
      try {
        txDetails = await fetchTransaction(auction.tx_id);
      } catch {
        // Best-effort
      }
    }

    const response: Record<string, any> = {
      auction_id: auction.auction_id,
      title: auction.title,
      description: auction.description,
      tx_id: auction.tx_id,
      created_at: auction.created_at,
      status: auction.status || 'pending',
      bid_count: auction.bid_count || 0,
      deadline: auction.deadline,
      token_type: auction.token_type,
      highest_bid: auction.highest_bid,
      second_highest_bid: auction.second_highest_bid,
      winner_hash: auction.winner_hash,
      last_synced: auction.last_synced,
      on_chain_raw: onChainData,
      tx_confirmed: txDetails ? true : false,
    };

    res.json(response);
  } catch (err) {
    logger.error(`GET /api/auctions/${req.params.id} failed:`, err);
    res.status(500).json({ error: 'Failed to fetch auction' });
  }
});

// POST /api/auctions — register new auction metadata
router.post('/', createAuctionLimiter, async (req: Request, res: Response) => {
  try {
    const { auction_id, title, description, seller_address, tx_id, token_type, deadline } = req.body;

    // Validate required fields
    if (!auction_id || !title || !seller_address || !tx_id) {
      res.status(400).json({
        error: 'Missing required fields: auction_id, title, seller_address, tx_id',
      });
      return;
    }

    // Validate auction_id format
    if (typeof auction_id !== 'string' || auction_id.trim().length === 0) {
      res.status(400).json({ error: 'auction_id is required' });
      return;
    }

    // Validate Aleo address format
    if (!/^aleo1[a-z0-9]{58}$/.test(seller_address)) {
      res.status(400).json({ error: 'Invalid Aleo address format' });
      return;
    }

    // Validate tx_id format
    if (!/^at1[a-z0-9]+$/.test(tx_id)) {
      res.status(400).json({ error: 'Invalid transaction ID format' });
      return;
    }

    // Best-effort TX verification — warn but don't block (explorer may be slow)
    const txVerified = await verifyTxExists(tx_id);
    if (!txVerified) {
      logger.warn(`TX ${tx_id.slice(0, 16)} not yet confirmed on explorer — registering anyway`);
    }

    // Sanitize user-supplied text to prevent stored XSS
    const safeTitle = sanitizeText(title).slice(0, 200);
    const safeDescription = sanitizeText(description || '').slice(0, 2000);

    const record = await createAuction({
      auction_id,
      title: safeTitle,
      description: safeDescription,
      seller_address,
      tx_id,
      token_type: typeof token_type === 'number' ? token_type : undefined,
      deadline: typeof deadline === 'number' ? deadline : undefined,
    });

    logger.info(`Auction registered: ${auction_id.slice(0, 16)}...`);

    res.status(201).json({
      auction_id: record.auction_id,
      title: record.title,
      description: record.description,
      tx_id: record.tx_id,
      created_at: record.created_at,
    });
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      res.status(409).json({ error: err.message });
      return;
    }
    logger.error('POST /api/auctions failed:', err);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// POST /api/auctions/:id/bids — register a bid
router.post('/:id/bids', bidLimiter, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { bidder_address, bid_hash, tx_id } = req.body;

    if (!bidder_address || !bid_hash || !tx_id) {
      res.status(400).json({
        error: 'Missing required fields: bidder_address, bid_hash, tx_id',
      });
      return;
    }

    // Validate bidder_address format
    if (!/^aleo1[a-z0-9]{58}$/.test(bidder_address)) {
      res.status(400).json({ error: 'Invalid bidder address format' });
      return;
    }

    // Validate bid_hash length
    if (typeof bid_hash !== 'string' || bid_hash.length > 256) {
      res.status(400).json({ error: 'Invalid bid_hash' });
      return;
    }

    // Validate tx_id format
    if (!/^at1[a-z0-9]+$/.test(tx_id)) {
      res.status(400).json({ error: 'Invalid transaction ID format' });
      return;
    }

    // Best-effort TX verification
    const txVerified = await verifyTxExists(tx_id);
    if (!txVerified) {
      logger.warn(`Bid TX ${tx_id.slice(0, 16)} not yet confirmed — registering anyway`);
    }

    const auction = await getAuctionById(id);
    if (!auction) {
      res.status(404).json({ error: 'Auction not found' });
      return;
    }

    const record = await createBid({
      auction_id: id,
      bidder_address,
      bid_hash,
      tx_id,
    });

    logger.info(`Bid registered for auction ${id.slice(0, 16)}...`);

    res.status(201).json({
      auction_id: record.auction_id,
      bid_hash: record.bid_hash,
      tx_id: record.tx_id,
      created_at: record.created_at,
    });
  } catch (err) {
    logger.error(`POST /api/auctions/${req.params.id}/bids failed:`, err);
    res.status(500).json({ error: 'Failed to register bid' });
  }
});

// GET /api/auctions/:id/bids — list revealed bids (paginated)
router.get('/:id/bids', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Validate auction exists before querying bids
    const auction = await getAuctionById(id);
    if (!auction) {
      res.status(404).json({ error: 'Auction not found' });
      return;
    }

    const bids = await getBidsByAuction(id);

    // Return public-safe view (no encrypted addresses)
    const safeBids = bids.map((b) => ({
      auction_id: b.auction_id,
      bid_hash: b.bid_hash,
      tx_id: b.tx_id,
      revealed: b.revealed || false,
      revealed_amount: b.revealed_amount,
      created_at: b.created_at,
    }));

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const result = paginate(safeBids, page, limit);

    // Also try to fetch from on-chain revealed_bids mapping
    let onChainRevealed: string | null = null;
    try {
      const key = id.endsWith('field') ? id : `${id}field`;
      onChainRevealed = await fetchMapping('revealed_bids', key);
    } catch {
      // Best-effort
    }

    res.json({
      auction_id: id,
      bids: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      on_chain_summary: onChainRevealed,
    });
  } catch (err) {
    logger.error(`GET /api/auctions/${req.params.id}/bids failed:`, err);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// GET /api/auctions/:id/events — event sourcing: history for a specific auction
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const events = await getAuctionEvents(id, limit);
    res.json({ auction_id: id, events, total: events.length });
  } catch (err) {
    logger.error(`GET /api/auctions/${req.params.id}/events failed:`, err);
    res.status(500).json({ error: 'Failed to fetch auction events' });
  }
});

export default router;
