import { logger } from './logger';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: any = null;

export function getSupabase(): any {
  if (!client && useSupabase) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
      logger.info('Supabase client initialized');
    } catch (err) {
      logger.error('Failed to initialize Supabase client:', err);
      return null;
    }
  }
  return client;
}

if (useSupabase) {
  logger.info('Supabase configured — using PostgreSQL for storage');
} else {
  logger.warn('SUPABASE_URL/SUPABASE_ANON_KEY not set — falling back to filesystem storage');
}
