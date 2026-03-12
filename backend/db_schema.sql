-- Obscura Auction — Supabase schema
-- Run this in the Supabase SQL Editor to set up the database.

CREATE TABLE auction_events (
  id BIGSERIAL PRIMARY KEY,
  auction_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  transaction_id TEXT,
  block_height BIGINT,
  actor_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auctions (
  auction_id TEXT PRIMARY KEY,
  current_status INTEGER DEFAULT 1,
  title TEXT,
  description TEXT,
  seller_hash TEXT,
  category INTEGER DEFAULT 4,
  token_type INTEGER DEFAULT 1,
  auction_mode INTEGER DEFAULT 1,
  bid_count INTEGER DEFAULT 0,
  reserve_price_hash TEXT,
  deadline BIGINT,
  reveal_deadline BIGINT,
  dispute_deadline BIGINT,
  winning_bid BIGINT,
  second_price BIGINT,
  settlement_tx TEXT,
  encrypted_metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bids (
  id BIGSERIAL PRIMARY KEY,
  auction_id TEXT REFERENCES auctions(auction_id),
  bid_hash TEXT UNIQUE NOT NULL,
  commitment TEXT NOT NULL,
  bidder_hash TEXT,
  status TEXT DEFAULT 'sealed',
  revealed_amount BIGINT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE platform_stats (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  period_start TIMESTAMPTZ,
  auctions_created INTEGER DEFAULT 0,
  bids_placed INTEGER DEFAULT 0,
  auctions_settled INTEGER DEFAULT 0,
  total_volume_aleo BIGINT DEFAULT 0,
  total_volume_usdcx BIGINT DEFAULT 0,
  vickrey_total_savings BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_auction ON auction_events(auction_id);
CREATE INDEX idx_events_type ON auction_events(event_type);
CREATE INDEX idx_events_created ON auction_events(created_at DESC);
CREATE INDEX idx_auctions_status ON auctions(current_status);
CREATE INDEX idx_bids_auction ON bids(auction_id);
