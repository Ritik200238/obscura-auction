import {
  PROGRAM_ID,
  EXPLORER_API,
  TESTNET_NETWORK,
  AUCTION_MODE,
  TOKEN_TYPE,
  STATUS,
  FEE_DENOMINATOR,
  PLATFORM_FEE_BPS,
} from './constants.js';
import type {
  ObscuraConfig,
  AuctionData,
  ParsedAuction,
  DutchConfig,
  SettlementData,
  DisputeData,
} from './types.js';
import {
  fetchMapping,
  parseAuctionData,
  parseDutchConfig,
  computeDutchPrice,
  fetchBlockHeight,
  hashStringToField,
  generateNonce,
  toMicrocredits,
  fromMicrocredits,
} from './utils.js';

/**
 * ObscuraClient — Main entry point for interacting with the Obscura auction protocol.
 *
 * Provides read-only methods for querying on-chain state (auctions, bids, disputes)
 * and helper methods that prepare transition inputs for wallet execution.
 *
 * Usage:
 *   const client = new ObscuraClient({ network: 'testnet' });
 *   const auction = await client.getAuction('123...field');
 *   const price = await client.getDutchCurrentPrice('123...field');
 */
export class ObscuraClient {
  readonly programId: string;
  readonly endpoint: string;
  readonly network: string;

  constructor(config: ObscuraConfig = {}) {
    this.programId = config.programId ?? PROGRAM_ID;
    this.endpoint = config.endpoint ?? EXPLORER_API;
    this.network = config.network ?? 'testnet';
  }

  // ──────────────────────────────────────────────
  //  READ: Auction state
  // ──────────────────────────────────────────────

  /** Fetch and parse an auction's full on-chain data. */
  async getAuction(auctionId: string): Promise<ParsedAuction | null> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const raw = await fetchMapping('auctions', key, this.programId, this.endpoint, this.network);
    if (!raw) return null;
    return parseAuctionData(raw, auctionId);
  }

  /** Fetch the current highest bid for an auction. */
  async getHighestBid(auctionId: string): Promise<bigint> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const raw = await fetchMapping('highest_bids', key, this.programId, this.endpoint, this.network);
    if (!raw) return 0n;
    return BigInt(raw.replace('u128', ''));
  }

  /** Fetch the second-highest bid (used for Vickrey settlement price). */
  async getSecondHighestBid(auctionId: string): Promise<bigint> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const raw = await fetchMapping('second_highest_bids', key, this.programId, this.endpoint, this.network);
    if (!raw) return 0n;
    return BigInt(raw.replace('u128', ''));
  }

  /** Fetch the winner's bid hash for a settled auction. */
  async getWinner(auctionId: string): Promise<string | null> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    return fetchMapping('auction_winners', key, this.programId, this.endpoint, this.network);
  }

  /** Fetch Dutch auction configuration (start_price, end_price). */
  async getDutchConfig(auctionId: string): Promise<DutchConfig | null> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const raw = await fetchMapping('dutch_params', key, this.programId, this.endpoint, this.network);
    if (!raw) return null;
    return parseDutchConfig(raw);
  }

  /**
   * Compute the current Dutch auction price.
   * Pure client-side computation — no on-chain call needed if you have the config.
   */
  async getDutchCurrentPrice(auctionId: string): Promise<{ price: bigint; blockHeight: number } | null> {
    const [auction, config] = await Promise.all([
      this.getAuction(auctionId),
      this.getDutchConfig(auctionId),
    ]);
    if (!auction || !config) return null;
    const height = await fetchBlockHeight(this.endpoint, this.network);
    const price = computeDutchPrice(config, auction.created_at, auction.deadline, height);
    return { price, blockHeight: height };
  }

  /** Fetch settlement data for a completed auction. */
  async getSettlement(auctionId: string): Promise<SettlementData | null> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const raw = await fetchMapping('settlements', key, this.programId, this.endpoint, this.network);
    if (!raw) return null;
    const clean = raw.replace(/\s+/g, ' ').trim();
    const extract = (name: string, type: 'field' | 'u128' | 'u64') => {
      const regex = new RegExp(`${name}:\\s*([^,}]+)`);
      const match = clean.match(regex);
      if (!match) return type === 'field' ? '' : '0';
      return match[1].replace(/u128$|u64$|field$/, '').trim();
    };
    return {
      winner_bid_hash: extract('winner_bid_hash', 'field'),
      final_price: BigInt(extract('final_price', 'u128')),
      fee_collected: BigInt(extract('fee_collected', 'u128')),
      settled_at: Number(extract('settled_at', 'u64')),
    };
  }

  // ──────────────────────────────────────────────
  //  READ: Dispute state
  // ──────────────────────────────────────────────

  /** Check if an auction has an active dispute. */
  async getDispute(auctionId: string): Promise<DisputeData | null> {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const raw = await fetchMapping('disputes', key, this.programId, this.endpoint, this.network);
    if (!raw) return null;
    const clean = raw.replace(/\s+/g, ' ').trim();
    const extract = (name: string) => {
      const regex = new RegExp(`${name}:\\s*([^,}]+)`);
      const match = clean.match(regex);
      return match ? match[1].trim() : '';
    };
    const strip = (val: string) => val.replace(/u128$|u64$|field$/, '').trim();
    return {
      disputer_hash: extract('disputer_hash'),
      bond_amount: BigInt(strip(extract('bond_amount'))),
      reason_hash: extract('reason_hash'),
      filed_at: Number(strip(extract('filed_at'))),
    };
  }

  // ──────────────────────────────────────────────
  //  READ: Platform state
  // ──────────────────────────────────────────────

  /** Fetch the platform treasury balance for a given token. */
  async getTreasuryBalance(tokenType: number): Promise<bigint> {
    const key = tokenType === TOKEN_TYPE.ALEO ? '0u8' : tokenType === TOKEN_TYPE.USDCX ? '1u8' : '2u8';
    const raw = await fetchMapping('platform_treasury', key, this.programId, this.endpoint, this.network);
    if (!raw) return 0n;
    return BigInt(raw.replace('u128', ''));
  }

  /** Fetch the current block height. */
  async getBlockHeight(): Promise<number> {
    return fetchBlockHeight(this.endpoint, this.network);
  }

  // ──────────────────────────────────────────────
  //  HELPERS: Prepare transition inputs
  // ──────────────────────────────────────────────

  /**
   * Prepare inputs for create_auction transition.
   * Returns the array of input strings ready for wallet executeTransaction.
   */
  prepareCreateAuction(params: {
    title: string;
    category: number;
    reservePrice: number;
    auctionMode: number;
    tokenType: number;
    durationBlocks: number;
    currentBlockHeight: number;
  }): { functionName: string; inputs: string[] } {
    const itemHash = hashStringToField(params.title);
    const nonce = generateNonce();
    const reserveMicros = toMicrocredits(params.reservePrice);
    const deadline = params.currentBlockHeight + params.durationBlocks + 20; // 20-block buffer

    return {
      functionName: 'create_auction',
      inputs: [
        itemHash,
        `${params.category}u8`,
        reserveMicros,
        `${params.auctionMode}u8`,
        `${params.tokenType}u8`,
        nonce,
        `${deadline}u64`,
      ],
    };
  }

  /**
   * Prepare inputs for create_dutch_auction transition.
   */
  prepareCreateDutchAuction(params: {
    title: string;
    category: number;
    startPrice: number;
    endPrice: number;
    tokenType: number;
    durationBlocks: number;
    currentBlockHeight: number;
  }): { functionName: string; inputs: string[] } {
    const itemHash = hashStringToField(params.title);
    const nonce = generateNonce();
    const startMicros = toMicrocredits(params.startPrice);
    const endMicros = toMicrocredits(params.endPrice);
    const deadline = params.currentBlockHeight + params.durationBlocks + 20;

    return {
      functionName: 'create_dutch_auction',
      inputs: [
        itemHash,
        `${params.category}u8`,
        startMicros,
        endMicros,
        `${params.tokenType}u8`,
        nonce,
        `${deadline}u64`,
      ],
    };
  }

  /**
   * Prepare inputs for place_bid transition (sealed-bid modes only).
   */
  preparePlaceBid(auctionId: string, amount: number, tokenType: number): {
    functionName: string;
    inputs: string[];
    nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(amount);
    return {
      functionName: 'place_bid',
      inputs: [key, micros, nonce, `${tokenType}u8`],
      nonce,
    };
  }

  /**
   * Prepare inputs for bid_dutch transition.
   */
  prepareBidDutch(auctionId: string, maxPrice: number): {
    functionName: string;
    inputs: string[];
    nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(maxPrice);
    return {
      functionName: 'bid_dutch',
      inputs: [key, micros, nonce],
      nonce,
    };
  }

  /**
   * Prepare inputs for bid_english transition.
   */
  prepareBidEnglish(auctionId: string, amount: number): {
    functionName: string;
    inputs: string[];
    nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(amount);
    return {
      functionName: 'bid_english',
      inputs: [key, micros, nonce],
      nonce,
    };
  }

  /**
   * Compute the fee breakdown for a given amount.
   */
  computeFee(amount: bigint): { fee: bigint; sellerPayout: bigint } {
    const fee = (amount * BigInt(PLATFORM_FEE_BPS)) / BigInt(FEE_DENOMINATOR);
    return { fee, sellerPayout: amount - fee };
  }

  /**
   * Check if an auction is still within the dispute window.
   */
  async isDisputable(auctionId: string): Promise<boolean> {
    const [auction, settlement] = await Promise.all([
      this.getAuction(auctionId),
      this.getSettlement(auctionId),
    ]);
    if (!auction || !settlement || auction.status !== STATUS.SETTLED) return false;
    const height = await this.getBlockHeight();
    return height <= settlement.settled_at + 100; // DISPUTE_WINDOW_BLOCKS
  }

  /**
   * Prepare inputs for bid_dutch_usdcx transition.
   */
  prepareBidDutchUsdcx(auctionId: string, maxPrice: number): {
    functionName: string;
    inputs: string[];
    nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(maxPrice);
    return { functionName: 'bid_dutch_usdcx', inputs: [key, micros, nonce], nonce };
  }

  /**
   * Prepare inputs for bid_english_usdcx transition.
   */
  prepareBidEnglishUsdcx(auctionId: string, amount: number): {
    functionName: string;
    inputs: string[];
    nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(amount);
    return { functionName: 'bid_english_usdcx', inputs: [key, micros, nonce], nonce };
  }

  /** Prepare inputs for bid_dutch_usad transition. */
  prepareBidDutchUsad(auctionId: string, maxPrice: number): {
    functionName: string; inputs: string[]; nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(maxPrice);
    return { functionName: 'bid_dutch_usad', inputs: [key, micros, nonce], nonce };
  }

  /** Prepare inputs for bid_english_usad transition. */
  prepareBidEnglishUsad(auctionId: string, amount: number): {
    functionName: string; inputs: string[]; nonce: string;
  } {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`;
    const nonce = generateNonce();
    const micros = toMicrocredits(amount);
    return { functionName: 'bid_english_usad', inputs: [key, micros, nonce], nonce };
  }

  // ──────────────────────────────────────────────
  //  CONVENIENCE: Format & display helpers
  // ──────────────────────────────────────────────

  /** Convert microcredits to display amount. */
  formatAmount(micros: bigint | number): string {
    return fromMicrocredits(micros).toFixed(6);
  }
}
