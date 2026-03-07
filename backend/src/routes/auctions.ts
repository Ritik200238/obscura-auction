import { Router, Request, Response } from 'express';
import { fetchMapping, fetchTransaction } from '../explorer';
import {
  getAllAuctions,
  getAuctionById,
  createAuction,
  getBidsByAuction,
  createBid,
  AuctionRecord,
} from '../store';
import { syncAllAuctions } from '../sync';

const router = Router();

// GET /api/auctions — list all auctions
router.get('/', async (_req: Request, res: Response) => {
  try {
    // On-demand sync before returning data (throttled to 30s)
    await syncAllAuctions();
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

    res.json({ auctions: safeAuctions, count: safeAuctions.length });
  } catch (err) {
    console.error('[auctions] GET / failed:', err);
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
    console.error(`[auctions] GET /${req.params.id} failed:`, err);
    res.status(500).json({ error: 'Failed to fetch auction' });
  }
});

// POST /api/auctions — register new auction metadata
router.post('/', async (req: Request, res: Response) => {
  try {
    const { auction_id, title, description, seller_address, tx_id, token_type, deadline } = req.body;

    // Validate required fields
    if (!auction_id || !title || !seller_address || !tx_id) {
      res.status(400).json({
        error: 'Missing required fields: auction_id, title, seller_address, tx_id',
      });
      return;
    }

    // Validate auction_id format (field hash — numeric string, possibly very large)
    if (!auction_id || typeof auction_id !== 'string' || auction_id.trim().length === 0) {
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

    const record = await createAuction({
      auction_id,
      title: title.slice(0, 200), // Cap title length
      description: (description || '').slice(0, 2000), // Cap description
      seller_address,
      tx_id,
      token_type: typeof token_type === 'number' ? token_type : undefined,
      deadline: typeof deadline === 'number' ? deadline : undefined,
    });

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
    console.error('[auctions] POST / failed:', err);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// POST /api/auctions/:id/bids — register a bid
router.post('/:id/bids', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { bidder_address, bid_hash, tx_id } = req.body;

    if (!bidder_address || !bid_hash || !tx_id) {
      res.status(400).json({
        error: 'Missing required fields: bidder_address, bid_hash, tx_id',
      });
      return;
    }

    // Verify auction exists
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

    res.status(201).json({
      auction_id: record.auction_id,
      bid_hash: record.bid_hash,
      tx_id: record.tx_id,
      created_at: record.created_at,
    });
  } catch (err) {
    console.error(`[auctions] POST /${req.params.id}/bids failed:`, err);
    res.status(500).json({ error: 'Failed to register bid' });
  }
});

// GET /api/auctions/:id/bids — list revealed bids for an auction
router.get('/:id/bids', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Get locally tracked bids
    const bids = await getBidsByAuction(id);

    // Return public-safe view (no encrypted addresses)
    const safeBids = bids
      .filter((b) => b.revealed)
      .map((b) => ({
        auction_id: b.auction_id,
        bid_hash: b.bid_hash,
        tx_id: b.tx_id,
        revealed_amount: b.revealed_amount,
        created_at: b.created_at,
      }));

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
      bids: safeBids,
      count: safeBids.length,
      on_chain_summary: onChainRevealed,
    });
  } catch (err) {
    console.error(`[auctions] GET /${req.params.id}/bids failed:`, err);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

export default router;
