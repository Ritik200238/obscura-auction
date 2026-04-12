export const config = {
  // 4-program architecture (verified on testnet 2026-04-12)
  programId: 'obscura_core_v4.aleo',                        // Core: auction lifecycle + bidding
  settleProgramId: 'obscura_settle_v6.aleo',                // Settle v4: privacy-hardened ALEO paths (revealed_bids bool only)
  settleStableProgramId: 'obscura_settle_stable_v4.aleo',   // Settle Stable v4: privacy-hardened USDCx + USAD (pending deploy)
  marketProgramId: 'obscura_market_v2.aleo',                // Market: fixed sales + RFQ + token sales

  // Token programs
  creditsProgram: 'credits.aleo',
  usdcxProgramId: 'test_usdcx_stablecoin.aleo',
  usadProgramId: 'test_usad_stablecoin.aleo',

  // API endpoints
  explorerApi: 'https://api.explorer.provable.com/v1',
  explorerUrl: 'https://testnet.explorer.provable.com',
  backendApi: import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? 'https://obscura-auction.onrender.com' : 'http://localhost:3001'),

  // Network
  network: 'testnet' as const,
  defaultFee: 500_000, // microcredits (= 0.5 ALEO)
  blockTime: 15, // seconds per block
  blocksPerHour: 240,
  revealWindowBlocks: 2880,
  minAuctionDuration: 240,
  minBidAmount: 1000n, // microcredits
  platformFeeBps: 100, // 1%
}
