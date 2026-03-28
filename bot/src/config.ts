import 'dotenv/config';

export const config = {
  network: process.env.NETWORK ?? 'testnet',
  programId: process.env.PROGRAM_ID ?? 'obscura_v4.aleo',
  endpoint: process.env.ENDPOINT ?? 'https://api.explorer.provable.com/v1',
  pollInterval: Number(process.env.POLL_INTERVAL ?? 30000),
  watchAuctions: process.env.WATCH_AUCTIONS ?? 'all',
  dutchPriceThreshold: Number(process.env.DUTCH_PRICE_THRESHOLD ?? 0.5) * 1_000_000, // microcredits
  deadlineWarningBlocks: Number(process.env.DEADLINE_WARNING_BLOCKS ?? 100),
};
