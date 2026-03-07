import { fetchMapping, fetchCurrentHeight } from './explorer';
import { getAllAuctions, updateAuction } from './store';

const SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds — ~2 Aleo blocks

// Match contract's status constants exactly
const STATUS_MAP: Record<number, string> = {
  1: 'active',
  2: 'closed',
  3: 'revealing',
  4: 'settled',
  5: 'cancelled',
  6: 'failed',
  7: 'disputed',
  8: 'expired',
};

function parseStatusCode(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const code = parseInt(raw.replace(/u8$/, ''), 10);
  return STATUS_MAP[code] || `unknown(${code})`;
}

function parseU128(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/u128$/, '').replace(/u64$/, '').replace(/u8$/, '');
  const val = parseInt(cleaned, 10);
  return isNaN(val) ? undefined : val;
}

function parseField(raw: string | null): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/field$/, '').trim();
}

async function syncAuction(auctionId: string): Promise<void> {
  try {
    // Auction mappings use field keys
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;

    // Fetch on-chain auction data
    const rawAuction = await fetchMapping('auctions', key);
    if (!rawAuction) return;

    // Parse the AuctionData struct fields via regex
    const statusMatch = rawAuction.match(/status:\s*(\d+u8)/);
    const bidCountMatch = rawAuction.match(/bid_count:\s*(\d+u64)/);
    const deadlineMatch = rawAuction.match(/deadline:\s*(\d+u64)/);
    const tokenTypeMatch = rawAuction.match(/token_type:\s*(\d+u8)/);
    const auctionModeMatch = rawAuction.match(/auction_mode:\s*(\d+u8)/);

    const updates: Record<string, any> = {
      last_synced: new Date().toISOString(),
    };

    if (statusMatch) updates.status = parseStatusCode(statusMatch[1]);
    if (bidCountMatch) updates.bid_count = parseU128(bidCountMatch[1]);
    if (deadlineMatch) updates.deadline = parseU128(deadlineMatch[1]);
    if (tokenTypeMatch) {
      const tokenCode = parseInt(tokenTypeMatch[1].replace(/u8$/, ''), 10);
      updates.token_type = tokenCode === 2 ? 'USDCx' : 'ALEO';
    }

    // Fetch highest/second-highest bids from their dedicated mappings
    const highestRaw = await fetchMapping('highest_bids', key);
    if (highestRaw) updates.highest_bid = parseU128(highestRaw);

    const secondRaw = await fetchMapping('second_highest_bids', key);
    if (secondRaw) updates.second_highest_bid = parseU128(secondRaw);

    // Fetch winner hash
    const winnerRaw = await fetchMapping('auction_winners', key);
    if (winnerRaw) updates.winner_hash = parseField(winnerRaw);

    const result = await updateAuction(auctionId, updates);
    if (result) {
      console.log(`[sync] Updated auction ${auctionId}: status=${updates.status}, bids=${updates.bid_count}`);
    }
  } catch (err) {
    console.error(`[sync] Failed to sync auction ${auctionId}:`, err);
  }
}

async function runSync(): Promise<void> {
  const auctions = getAllAuctions();
  if (auctions.length === 0) {
    console.log('[sync] No auctions to sync');
    return;
  }

  const height = await fetchCurrentHeight();
  console.log(`[sync] Starting sync at block height ${height} for ${auctions.length} auction(s)`);

  for (const auction of auctions) {
    // Skip terminal states (no more on-chain changes expected)
    if (['cancelled', 'expired'].includes(auction.status || '')) continue;
    await syncAuction(auction.auction_id);
  }

  console.log('[sync] Sync complete');
}

export function startBackgroundSync(): void {
  console.log(`[sync] Background sync started (interval: ${SYNC_INTERVAL_MS / 1000}s)`);

  // Run immediately on start
  runSync().catch((err) => console.error('[sync] Initial sync failed:', err));

  // Then run on interval
  setInterval(() => {
    runSync().catch((err) => console.error('[sync] Periodic sync failed:', err));
  }, SYNC_INTERVAL_MS);
}
