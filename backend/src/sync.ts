import { fetchMapping, fetchCurrentHeight } from './explorer';
import { getAllAuctions, updateAuction } from './store';
import { logger } from './logger';

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
    logger.error(`Failed to sync auction ${auctionId.slice(0, 16)}...:`, err);
  }
}

// Throttle: don't sync all auctions more than once per 30s
let lastFullSync = 0;
let syncInFlight: Promise<void> | null = null;
const SYNC_COOLDOWN_MS = 30 * 1000;

/**
 * Sync all non-terminal auctions. Throttled to once per 30s.
 * Called on-demand when auction list is requested.
 * Uses a Promise sentinel to prevent concurrent syncs.
 */
const TERMINAL_STATUSES = ['cancelled', 'expired', 'settled', 'failed'];

export function syncAllAuctions(): Promise<void> {
  const now = Date.now();
  if (now - lastFullSync < SYNC_COOLDOWN_MS) return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  lastFullSync = now;
  syncInFlight = (async () => {
    try {
      const auctions = await getAllAuctions();
      if (auctions.length === 0) {
        lastFullSync = 0; // may be a transient storage failure; allow prompt retry
        return;
      }

      const height = await fetchCurrentHeight();
      logger.debug(`On-demand sync at height ${height} for ${auctions.length} auction(s)`);

      for (const auction of auctions) {
        if (TERMINAL_STATUSES.includes(auction.status || '')) continue;

        // Auto-expire: if auction is active, deadline passed, and no bids, mark expired
        if (auction.status === 'active' && auction.deadline && height > auction.deadline + 2880) {
          if ((auction.bid_count || 0) === 0) {
            logger.info(`Auto-expiring auction ${auction.auction_id.slice(0, 16)} (deadline ${auction.deadline}, current ${height})`);
            await updateAuction(auction.auction_id, { status: 'expired' });
            continue;
          }
        }

        await syncAuction(auction.auction_id);
      }
    } catch (err) {
      lastFullSync = 0; // allow immediate retry on next request
      logger.error('Full sync failed:', err);
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/**
 * Background sync for standalone mode (local dev).
 * On Vercel, sync is on-demand via syncAllAuctions().
 */
export function startBackgroundSync(): void {
  const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
  if (isVercel) {
    logger.info('Vercel detected — using on-demand sync');
    return;
  }

  logger.info('Background sync started (interval: 30s)');
  syncAllAuctions().catch((err) => logger.error('Initial sync failed:', err));

  setInterval(() => {
    syncAllAuctions().catch((err) => logger.error('Periodic sync failed:', err));
  }, 30 * 1000);
}
