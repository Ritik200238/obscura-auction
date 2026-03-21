import { config } from './config.js';
import { logInfo, logWarn, logAlert, logError, logSystem } from './alerts.js';

const MODE_LABELS: Record<number, string> = { 1: 'SEALED', 2: 'VICKREY', 3: 'DUTCH', 4: 'ENGLISH' };
const STATUS_ACTIVE = 1;
const STATUS_REVEALING = 3;
const STATUS_SETTLED = 4;

interface AuctionSnapshot {
  auction_id: string;
  mode: number;
  status: number;
  token_type: number;
  deadline: number;
  reveal_deadline: number;
  bid_count: number;
  highest_bid: bigint;
  dutch_price?: bigint;
}

// Tracks previous state to detect changes
const prevState = new Map<string, AuctionSnapshot>();

async function fetchMappingValue(mapping: string, key: string): Promise<string | null> {
  const url = `${config.endpoint}/${config.network}/program/${config.programId}/mapping/${mapping}/${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text === 'null' ? null : text;
  } catch {
    return null;
  }
}

async function fetchBlockHeight(): Promise<number> {
  const res = await fetch(`${config.endpoint}/${config.network}/block/height/latest`);
  if (!res.ok) throw new Error(`Block height fetch failed: ${res.status}`);
  return Number(await res.text());
}

function stripSuffix(val: string): string {
  return val.replace(/u8$|u64$|u128$|u32$|field$|bool$/g, '').trim();
}

function extractField(raw: string, name: string): string {
  const regex = new RegExp(`${name}:\\s*([^,}]+)`);
  const match = raw.match(regex);
  return match ? match[1].trim() : '';
}

async function checkAuction(auctionId: string, blockHeight: number): Promise<void> {
  const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
  const raw = await fetchMappingValue('auctions', key);
  if (!raw) return;

  const clean = raw.replace(/\s+/g, ' ');
  const status = Number(stripSuffix(extractField(clean, 'status')));
  const mode = Number(stripSuffix(extractField(clean, 'auction_mode')));
  const deadline = Number(stripSuffix(extractField(clean, 'deadline')));
  const revealDeadline = Number(stripSuffix(extractField(clean, 'reveal_deadline')));
  const bidCount = Number(stripSuffix(extractField(clean, 'bid_count')));
  const tokenType = Number(stripSuffix(extractField(clean, 'token_type')));
  const createdAt = Number(stripSuffix(extractField(clean, 'created_at')));

  const modeName = MODE_LABELS[mode] ?? 'UNKNOWN';
  const prev = prevState.get(auctionId);

  // Fetch highest bid
  const highRaw = await fetchMappingValue('highest_bids', key);
  const highestBid = highRaw ? BigInt(stripSuffix(highRaw)) : 0n;

  // ── DUTCH AUCTION MONITORING ──
  if (mode === 3 && status === STATUS_ACTIVE) {
    const dutchRaw = await fetchMappingValue('dutch_params', key);
    if (dutchRaw) {
      const startPrice = BigInt(stripSuffix(extractField(dutchRaw, 'start_price')));
      const endPrice = BigInt(stripSuffix(extractField(dutchRaw, 'end_price')));
      const elapsed = BigInt(blockHeight - createdAt);
      const totalDuration = BigInt(deadline - createdAt);
      const priceRange = startPrice - endPrice;
      const drop = totalDuration > 0n ? (priceRange * elapsed) / totalDuration : 0n;
      const currentPrice = startPrice - drop;
      const priceAleo = Number(currentPrice) / 1_000_000;

      logInfo(auctionId, modeName, `Current price: ${priceAleo.toFixed(4)} ALEO (floor: ${Number(endPrice) / 1e6})`);

      if (Number(currentPrice) <= config.dutchPriceThreshold) {
        logAlert(auctionId, modeName, `Price below threshold! ${priceAleo.toFixed(4)} <= ${config.dutchPriceThreshold / 1e6}`);
      }
    }
  }

  // ── ENGLISH AUCTION MONITORING ──
  if (mode === 4 && status === STATUS_ACTIVE) {
    const highAleo = Number(highestBid) / 1_000_000;
    if (prev && highestBid > prev.highest_bid) {
      logAlert(auctionId, modeName, `New highest bid: ${highAleo.toFixed(4)} ALEO (was ${Number(prev.highest_bid) / 1e6})`);
    } else {
      logInfo(auctionId, modeName, `Highest bid: ${highAleo.toFixed(4)} ALEO | Bids: ${bidCount}`);
    }
  }

  // ── SEALED/VICKREY DEADLINE WARNING ──
  if ((mode === 1 || mode === 2) && status === STATUS_ACTIVE) {
    const blocksRemaining = deadline - blockHeight;
    if (blocksRemaining <= config.deadlineWarningBlocks && blocksRemaining > 0) {
      logWarn(auctionId, modeName, `Deadline in ${blocksRemaining} blocks (~${Math.round(blocksRemaining * 15 / 60)}min) | Bids: ${bidCount}`);
    } else if (blocksRemaining <= 0) {
      logAlert(auctionId, modeName, `Deadline PASSED — ready for close_bidding`);
    } else {
      logInfo(auctionId, modeName, `Active | ${blocksRemaining} blocks to deadline | Bids: ${bidCount}`);
    }
  }

  // ── REVEALING PHASE MONITORING ──
  if (status === STATUS_REVEALING) {
    const revealBlocks = revealDeadline - blockHeight;
    if (revealBlocks <= 0) {
      logAlert(auctionId, modeName, `Reveal window CLOSED — ready for finalize_auction`);
    } else {
      logInfo(auctionId, modeName, `Revealing | ${revealBlocks} blocks remaining | Highest: ${Number(highestBid) / 1e6}`);
    }
  }

  // ── STATUS CHANGE DETECTION ──
  if (prev && prev.status !== status) {
    logAlert(auctionId, modeName, `Status changed: ${prev.status} → ${status}`);
  }

  // ── BID COUNT CHANGE ──
  if (prev && prev.bid_count < bidCount) {
    logAlert(auctionId, modeName, `New bid detected! Count: ${prev.bid_count} → ${bidCount}`);
  }

  // Save snapshot
  prevState.set(auctionId, {
    auction_id: auctionId,
    mode,
    status,
    token_type: tokenType,
    deadline,
    reveal_deadline: revealDeadline,
    bid_count: bidCount,
    highest_bid: highestBid,
  });
}

export async function runMonitorCycle(auctionIds: string[]): Promise<void> {
  try {
    const blockHeight = await fetchBlockHeight();
    logSystem(`Block ${blockHeight} — monitoring ${auctionIds.length} auction(s)`);

    for (const id of auctionIds) {
      try {
        await checkAuction(id, blockHeight);
      } catch (err) {
        logError(`Failed to check auction ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logError(`Monitor cycle failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
