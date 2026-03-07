import { Router, Request, Response } from 'express';
import { getAuctionsBySeller, getBidsByBidder } from '../store';

const router = Router();

// GET /api/my/auctions?address=X — list auctions created by this address
router.get('/auctions', async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;

    if (!address) {
      res.status(400).json({ error: 'Missing required query parameter: address' });
      return;
    }

    // Validate Aleo address format
    if (!/^aleo1[a-z0-9]{58}$/.test(address)) {
      res.status(400).json({ error: 'Invalid Aleo address format' });
      return;
    }

    const auctions = getAuctionsBySeller(address);

    // Return with decrypted seller address (since requester is the seller)
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

    res.json({ auctions: result, count: result.length });
  } catch (err) {
    console.error('[user] GET /auctions failed:', err);
    res.status(500).json({ error: 'Failed to fetch user auctions' });
  }
});

// GET /api/my/bids?address=X — list bids by this address
router.get('/bids', async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;

    if (!address) {
      res.status(400).json({ error: 'Missing required query parameter: address' });
      return;
    }

    // Validate Aleo address format
    if (!/^aleo1[a-z0-9]{58}$/.test(address)) {
      res.status(400).json({ error: 'Invalid Aleo address format' });
      return;
    }

    const bids = getBidsByBidder(address);

    // Return bid info (requester is the bidder, so they can see their own data)
    const result = bids.map((b) => ({
      auction_id: b.auction_id,
      bid_hash: b.bid_hash,
      tx_id: b.tx_id,
      created_at: b.created_at,
      revealed: b.revealed || false,
      revealed_amount: b.revealed_amount,
    }));

    res.json({ bids: result, count: result.length });
  } catch (err) {
    console.error('[user] GET /bids failed:', err);
    res.status(500).json({ error: 'Failed to fetch user bids' });
  }
});

export default router;
