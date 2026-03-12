-- Migration: Add deterministic address hash columns for indexed lookups
-- Run this in Supabase SQL Editor after db_schema.sql

ALTER TABLE auctions ADD COLUMN IF NOT EXISTS seller_address_hash TEXT;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS bidder_address_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_auctions_seller_hash ON auctions(seller_address_hash);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_hash ON bids(bidder_address_hash);
