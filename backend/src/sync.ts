import { fetchMapping, fetchCurrentHeight } from './explorer';
import { getAllAuctions, updateAuction } from './store';

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

/**
 * Sync a single auction's on-chain data. Called on-demand from API routes.
 */
export async function syncAuction(auctionId: string): Promise<void> {
  try {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;

    const rawAuction = await fetchMapping('auctions', key);
    if (!rawAuction) return;

    const statusMatch = rawAuction.match(/status:\s*(\d+u8)/);
    const bidCountMatch = rawAuction.match(/bid_count:\s*(\d+u64)/);
    const deadlineMatch = rawAuction.match(/deadline:\s*(\d+u64)/);
    const tokenTypeMatch = rawAuction.match(/token_type:\s*(\d+u8)/);

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

    const highestRaw = await fetchMapping('highest_bids', key);
    if (highestRaw) updates.highest_bid = parseU128(highestRaw);

    const secondRaw = await fetchMapping('second_highest_bids', key);
    if (secondRaw) updates.second_highest_bid = parseU128(secondRaw);

    const winnerRaw = await fetchMapping('auction_winners', key);
    if (winnerRaw) updates.winner_hash = parseField(winnerRaw);

    await updateAuction(auctionId, updates);
  } catch (err) {
    console.error(`[sync] Failed to sync auction ${auctionId}:`, err);
  }
}

// Throttle: don't sync all auctions more than once per 30s
let lastFullSync = 0;
const SYNC_COOLDOWN_MS = 30 * 1000;

/**
 * Sync all non-terminal auctions. Throttled to once per 30s.
 * Called on-demand when auction list is requested.
 */
export async function syncAllAuctions(): Promise<void> {
  const now = Date.now();
  if (now - lastFullSync < SYNC_COOLDOWN_MS) return;
  lastFullSync = now;

  try {
    const auctions = await getAllAuctions();
    if (auctions.length === 0) return;

    const height = await fetchCurrentHeight();
    console.log(`[sync] On-demand sync at height ${height} for ${auctions.length} auction(s)`);

    for (const auction of auctions) {
      if (['cancelled', 'expired'].includes(auction.status || '')) continue;
      await syncAuction(auction.auction_id);
    }
  } catch (err) {
    console.error('[sync] Full sync failed:', err);
  }
}

/**
 * Background sync for standalone mode (local dev).
 * On Vercel, sync is on-demand via syncAllAuctions().
 */
export function startBackgroundSync(): void {
  const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
  if (isVercel) {
    console.log('[sync] Vercel detected — using on-demand sync');
    return;
  }

  console.log('[sync] Background sync started (interval: 30s)');
  syncAllAuctions().catch((err) => console.error('[sync] Initial sync failed:', err));

  setInterval(() => {
    syncAllAuctions().catch((err) => console.error('[sync] Periodic sync failed:', err));
  }, 30 * 1000);
}
