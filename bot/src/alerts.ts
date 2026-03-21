type AlertLevel = 'INFO' | 'WARN' | 'ALERT' | 'ERROR';

const COLORS: Record<AlertLevel, string> = {
  INFO: '\x1b[36m',   // cyan
  WARN: '\x1b[33m',   // yellow
  ALERT: '\x1b[31m',  // red
  ERROR: '\x1b[91m',  // bright red
};
const RESET = '\x1b[0m';

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function truncate(id: string, n = 12): string {
  if (id.length <= n * 2) return id;
  return `${id.slice(0, n)}...${id.slice(-6)}`;
}

export function logInfo(auctionId: string, mode: string, message: string): void {
  const c = COLORS.INFO;
  console.log(`${c}[${timestamp()}] INFO  [${mode}] ${truncate(auctionId)} — ${message}${RESET}`);
}

export function logWarn(auctionId: string, mode: string, message: string): void {
  const c = COLORS.WARN;
  console.log(`${c}[${timestamp()}] WARN  [${mode}] ${truncate(auctionId)} — ${message}${RESET}`);
}

export function logAlert(auctionId: string, mode: string, message: string): void {
  const c = COLORS.ALERT;
  console.log(`${c}[${timestamp()}] ALERT [${mode}] ${truncate(auctionId)} — ${message}${RESET}`);
}

export function logError(message: string): void {
  const c = COLORS.ERROR;
  console.log(`${c}[${timestamp()}] ERROR ${message}${RESET}`);
}

export function logSystem(message: string): void {
  console.log(`\x1b[90m[${timestamp()}] ${message}\x1b[0m`);
}
