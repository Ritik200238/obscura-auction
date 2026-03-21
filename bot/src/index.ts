import { config } from './config.js';
import { runMonitorCycle } from './monitor.js';
import { logSystem, logError } from './alerts.js';

// Auction IDs to monitor — loaded from .env or passed as CLI args
function getAuctionIds(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;

  if (config.watchAuctions === 'all') {
    logSystem('WATCH_AUCTIONS=all — pass auction IDs as CLI args or in .env');
    logSystem('Usage: node dist/index.js <auction_id_1> <auction_id_2> ...');
    return [];
  }

  return config.watchAuctions.split(',').map(id => id.trim()).filter(Boolean);
}

async function main() {
  console.log('');
  logSystem('╔═══════════════════════════════════════════════╗');
  logSystem('║   OBSCURA AUCTION MONITOR v0.1.0              ║');
  logSystem('╚═══════════════════════════════════════════════╝');
  logSystem(`Network:  ${config.network}`);
  logSystem(`Program:  ${config.programId}`);
  logSystem(`Endpoint: ${config.endpoint}`);
  logSystem(`Interval: ${config.pollInterval / 1000}s`);
  console.log('');

  const auctionIds = getAuctionIds();
  if (auctionIds.length === 0) {
    logError('No auction IDs to monitor. Provide them as CLI args or in .env WATCH_AUCTIONS');
    process.exit(1);
  }

  logSystem(`Monitoring ${auctionIds.length} auction(s):`);
  auctionIds.forEach(id => logSystem(`  → ${id}`));
  console.log('');

  // Initial run
  await runMonitorCycle(auctionIds);

  // Recurring poll
  const interval = setInterval(() => runMonitorCycle(auctionIds), config.pollInterval);

  // Graceful shutdown
  const shutdown = () => {
    logSystem('Shutting down monitor...');
    clearInterval(interval);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
