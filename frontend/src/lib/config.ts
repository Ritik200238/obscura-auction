export const config = {
  programId: 'obscura_v3.aleo',
  creditsProgram: 'credits.aleo',
  usdcxProgramId: 'test_usdcx_stablecoin.aleo',
  explorerApi: 'https://api.explorer.provable.com/v1',
  explorerUrl: 'https://explorer.provable.com',
  backendApi: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
  network: 'testnet' as const,
  defaultFee: 0.5, // ALEO
  blockTime: 15, // seconds per block (approximate)
  blocksPerHour: 240,
  revealWindowBlocks: 2880,
  minAuctionDuration: 240,
  minBidAmount: 1000n, // microcredits
  platformFeeBps: 100, // 1%
}
