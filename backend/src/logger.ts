const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

// Read LOG_LEVEL dynamically so dotenv.config() has time to load .env first
// (static imports are hoisted before executable code, so reading at module init
// would always get 'info' since .env hasn't been loaded yet)
function shouldLog(level: Level): boolean {
  const current = (process.env.LOG_LEVEL || 'info') as Level;
  return LEVELS.indexOf(level) >= LEVELS.indexOf(current);
}

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (...args: unknown[]) => shouldLog('debug') && console.log(`[DEBUG] ${ts()}`, ...args),
  info: (...args: unknown[]) => shouldLog('info') && console.log(`[INFO]  ${ts()}`, ...args),
  warn: (...args: unknown[]) => shouldLog('warn') && console.warn(`[WARN]  ${ts()}`, ...args),
  error: (...args: unknown[]) => shouldLog('error') && console.error(`[ERROR] ${ts()}`, ...args),
};
