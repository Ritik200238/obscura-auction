import { logger } from './logger';

/**
 * Validate required environment variables and log startup config.
 * Call this at the top of index.ts BEFORE importing anything that uses env vars.
 */
export function validateEnv(): void {
  const errors: string[] = [];

  // ENCRYPTION_KEY is mandatory — must be 64+ hex characters
  if (!process.env.ENCRYPTION_KEY || !/^[0-9a-fA-F]{64,}$/.test(process.env.ENCRYPTION_KEY)) {
    errors.push(
      'ENCRYPTION_KEY environment variable is required (64+ hex characters). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (errors.length > 0) {
    for (const err of errors) {
      logger.error(err);
    }
    throw new Error(`Missing required environment variables:\n  - ${errors.join('\n  - ')}`);
  }

  // Supabase: optional but warn if only one of the two is set
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_ANON_KEY;
  if ((supaUrl && !supaKey) || (!supaUrl && supaKey)) {
    logger.warn(
      'Only one of SUPABASE_URL / SUPABASE_ANON_KEY is set — both are required for Supabase storage. Falling back to filesystem.'
    );
  }

  // Log config (without secrets)
  const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const useSupabase = !!(supaUrl && supaKey);
  logger.info('Environment validated:');
  logger.info(`  PORT:           ${process.env.PORT || '3001 (default)'}`);
  logger.info(`  FRONTEND_URL:   ${process.env.FRONTEND_URL || '(not set — using defaults)'}`);
  logger.info(`  ENCRYPTION_KEY: ${'*'.repeat(8)}...${process.env.ENCRYPTION_KEY!.slice(-4)}`);
  logger.info(`  SUPABASE:       ${useSupabase ? 'configured' : 'not configured (using filesystem)'}`);
  logger.info(`  REDIS (legacy): ${redisUrl ? 'configured' : 'not configured'}`);
  logger.info(`  LOG_LEVEL:      ${process.env.LOG_LEVEL || 'info (default)'}`);
  logger.info(`  EXPLORER_API:   ${process.env.EXPLORER_API || 'https://api.explorer.provable.com/v1 (default)'}`);
  logger.info(`  PROGRAM_ID:     ${process.env.PROGRAM_ID || 'obscura_v3.aleo (default)'}`);
}
