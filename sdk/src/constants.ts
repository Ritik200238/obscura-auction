// Mirrors the on-chain constants in obscura_v5.aleo exactly.

export const PROGRAM_ID = 'obscura_v5.aleo';

export const STATUS = {
  ACTIVE: 1,
  CLOSED: 2,
  REVEALING: 3,
  SETTLED: 4,
  CANCELLED: 5,
  FAILED: 6,
  DISPUTED: 7,
  EXPIRED: 8,
} as const;

export const STATUS_LABELS: Record<number, string> = {
  [STATUS.ACTIVE]: 'active',
  [STATUS.CLOSED]: 'closed',
  [STATUS.REVEALING]: 'revealing',
  [STATUS.SETTLED]: 'settled',
  [STATUS.CANCELLED]: 'cancelled',
  [STATUS.FAILED]: 'failed',
  [STATUS.DISPUTED]: 'disputed',
  [STATUS.EXPIRED]: 'expired',
};

export const TOKEN_TYPE = {
  ALEO: 1,
  USDCX: 2,
  USAD: 3,
} as const;

export const TOKEN_LABELS: Record<number, string> = {
  [TOKEN_TYPE.ALEO]: 'ALEO',
  [TOKEN_TYPE.USDCX]: 'USDCx',
  [TOKEN_TYPE.USAD]: 'USAD',
};

export const AUCTION_MODE = {
  FIRST_PRICE: 1,
  VICKREY: 2,
  DUTCH: 3,
  ENGLISH: 4,
} as const;

export const MODE_LABELS: Record<number, string> = {
  [AUCTION_MODE.FIRST_PRICE]: 'First-Price Sealed',
  [AUCTION_MODE.VICKREY]: 'Vickrey (2nd-Price)',
  [AUCTION_MODE.DUTCH]: 'Dutch (Descending)',
  [AUCTION_MODE.ENGLISH]: 'English (Ascending)',
};

// Fee and timing constants (match on-chain)
export const PLATFORM_FEE_BPS = 100;       // 1%
export const FEE_DENOMINATOR = 10000;
export const MIN_BID_INCREMENT_BPS = 500;  // 5% for English
export const REVEAL_WINDOW_BLOCKS = 2880;
export const MIN_AUCTION_DURATION = 240;
export const MIN_BID_AMOUNT = 1000;        // microcredits
export const SNIPE_WINDOW_BLOCKS = 40;
export const SNIPE_EXTENSION_BLOCKS = 40;
export const DISPUTE_WINDOW_BLOCKS = 100;
export const DISPUTE_BOND_MIN_BPS = 1000;  // 10%

// Explorer API
export const EXPLORER_API = 'https://api.explorer.provable.com/v1';
export const TESTNET_NETWORK = 'testnet';
