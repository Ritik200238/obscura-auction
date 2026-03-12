import fetch from 'node-fetch';
import { logger } from './logger';

const EXPLORER_API = process.env.EXPLORER_API || 'https://api.explorer.provable.com/v1';
const PROGRAM_ID = process.env.PROGRAM_ID || 'obscura_v3.aleo';

export async function fetchMapping(mapping: string, key: string): Promise<string | null> {
  try {
    const url = `${EXPLORER_API}/testnet/program/${PROGRAM_ID}/mapping/${encodeURIComponent(mapping)}/${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal as any });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    return text.replace(/"/g, '');
  } catch (err) {
    logger.debug(`fetchMapping(${mapping}, ${key.slice(0, 16)}...) failed:`, err);
    return null;
  }
}

export async function fetchCurrentHeight(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${EXPLORER_API}/testnet/block/height/latest`, { signal: controller.signal as any });
    clearTimeout(timeout);
    if (!res.ok) return 0;
    const text = await res.text();
    return parseInt(text, 10);
  } catch (err) {
    clearTimeout(timeout);
    logger.debug('fetchCurrentHeight failed:', err);
    return 0;
  }
}

export async function fetchTransaction(txId: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${EXPLORER_API}/testnet/transaction/${txId}`, { signal: controller.signal as any });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    logger.debug(`fetchTransaction(${txId.slice(0, 16)}...) failed:`, err);
    return null;
  }
}

export { EXPLORER_API, PROGRAM_ID };
