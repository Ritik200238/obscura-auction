import { Router, Request, Response } from 'express';
import { getAuctionsBySeller, getBidsByBidder } from '../store';
import { logger } from '../logger';
import { paginate } from '../utils';

const router = Router();

// GET /api/my/auctions?address=X — list auctions created by this address (paginated)
router.get('/auctions', async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;

    if (!address) {
      res.status(400).json({ error: 'Missing required query parameter: address' });
      return;
    }

    if (!/^aleo1[a-z0-9]{58}$/.test(address)) {
      res.status(400).json({ error: 'Invalid Aleo address format' });
      return;
    }

    const auctions = await getAuctionsBySeller(address);

    const result = auctions.map((a) => ({
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
    const paged = paginate(result, page, limit);

    res.json({ auctions: paged.data, total: paged.total, page: paged.page, limit: paged.limit });
  } catch (err) {
    logger.error('GET /api/my/auctions failed:', err);
    res.status(500).json({ error: 'Failed to fetch user auctions' });
  }
});

// GET /api/my/bids?address=X — list bids by this address (paginated)
router.get('/bids', async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;

    if (!address) {
      res.status(400).json({ error: 'Missing required query parameter: address' });
      return;
    }

    if (!/^aleo1[a-z0-9]{58}$/.test(address)) {
      res.status(400).json({ error: 'Invalid Aleo address format' });
      return;
    }

    const bids = await getBidsByBidder(address);

    // Omit revealed_amount — this endpoint is unauthenticated, so returning
    // bid amounts would let anyone query another bidder's sealed bid value
    const result = bids.map((b) => ({
      auction_id: b.auction_id,
      bid_hash: b.bid_hash,
      tx_id: b.tx_id,
      created_at: b.created_at,
      revealed: b.revealed || false,
    }));

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const paged = paginate(result, page, limit);

    res.json({ bids: paged.data, total: paged.total, page: paged.page, limit: paged.limit });
  } catch (err) {
    logger.error('GET /api/my/bids failed:', err);
    res.status(500).json({ error: 'Failed to fetch user bids' });
  }
});

export default router;
