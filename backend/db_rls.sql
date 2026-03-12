-- Enable Row Level Security on all tables
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;

-- Policy: anon can read all rows (public data — sensitive fields are encrypted)
CREATE POLICY "anon_read_auctions" ON auctions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_bids" ON bids FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_events" ON auction_events FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_stats" ON platform_stats FOR SELECT TO anon USING (true);

-- Policy: anon can insert (backend uses anon key to write)
CREATE POLICY "anon_insert_auctions" ON auctions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_bids" ON bids FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_events" ON auction_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_stats" ON platform_stats FOR INSERT TO anon WITH CHECK (true);

-- Policy: anon can update auctions (for sync/status updates)
CREATE POLICY "anon_update_auctions" ON auctions FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- No DELETE policies — data is immutable (event sourcing)
