import http from 'http';
import { config } from './config.js';
import { runMonitorCycle } from './monitor.js';
import { logSystem, logError } from './alerts.js';

// Auction IDs to monitor — loaded from .env or passed as CLI args
function getAuctionIds(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;

  if (config.watchAuctions === 'all') {
    return [];
  }

  return config.watchAuctions.split(',').map(id => id.trim()).filter(Boolean);
}

let lastCycleAt: number | null = null;
let lastCycleOk = false;
let cycleCount = 0;

async function runCycle(auctionIds: string[]) {
  try {
    await runMonitorCycle(auctionIds);
    lastCycleAt = Date.now();
    lastCycleOk = true;
    cycleCount++;
  } catch (err) {
    lastCycleOk = false;
    logError(`Cycle failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function startHealthServer(auctionIds: string[]) {
  const port = Number(process.env.PORT ?? 3000);
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'obscura-auction-bot',
        version: '0.1.0',
        network: config.network,
        programId: config.programId,
        settleProgramId: config.settleProgramId,
        watching: auctionIds.length,
        auctionIds,
        cycleCount,
        lastCycleAt: lastCycleAt ? new Date(lastCycleAt).toISOString() : null,
        lastCycleOk,
        pollIntervalSeconds: config.pollInterval / 1000,
      }, null, 2));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });
  server.listen(port, () => logSystem(`Health server on :${port} (/health)`));
  return server;
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
  const server = startHealthServer(auctionIds);

  if (auctionIds.length === 0) {
    logSystem('WATCH_AUCTIONS=all (no specific IDs) — health server running, monitor idle until IDs configured');
  } else {
    logSystem(`Monitoring ${auctionIds.length} auction(s):`);
    auctionIds.forEach(id => logSystem(`  → ${id}`));
    console.log('');
    await runCycle(auctionIds);
  }

  // Recurring poll — skips work if no auctions but keeps the process alive
  const interval = setInterval(() => {
    if (auctionIds.length > 0) runCycle(auctionIds);
  }, config.pollInterval);

  const shutdown = () => {
    logSystem('Shutting down monitor...');
    clearInterval(interval);
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
