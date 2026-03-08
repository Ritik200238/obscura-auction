import fetch from 'node-fetch';

const EXPLORER_API = process.env.EXPLORER_API || 'https://api.explorer.provable.com/v1';
const PROGRAM_ID = process.env.PROGRAM_ID || 'obscura_v2.aleo';

export async function fetchMapping(mapping: string, key: string): Promise<string | null> {
  try {
    const url = `${EXPLORER_API}/testnet/program/${PROGRAM_ID}/mapping/${mapping}/${key}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal as any });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    return text.replace(/"/g, '');
  } catch (err) {
    console.error(`[explorer] fetchMapping(${mapping}, ${key}) failed:`, err);
    return null;
  }
}

export async function fetchCurrentHeight(): Promise<number> {
  try {
    const res = await fetch(`${EXPLORER_API}/testnet/block/height/latest`);
    if (!res.ok) return 0;
    const text = await res.text();
    return parseInt(text, 10);
  } catch (err) {
    console.error('[explorer] fetchCurrentHeight failed:', err);
    return 0;
  }
}

export async function fetchTransaction(txId: string): Promise<any> {
  try {
    const res = await fetch(`${EXPLORER_API}/testnet/transaction/${txId}`);
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error(`[explorer] fetchTransaction(${txId}) failed:`, err);
    return null;
  }
}

export async function fetchMappingKeys(mapping: string): Promise<string[]> {
  try {
    const url = `${EXPLORER_API}/testnet/program/${PROGRAM_ID}/mapping/${mapping}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json() as Promise<string[]>;
  } catch (err) {
    console.error(`[explorer] fetchMappingKeys(${mapping}) failed:`, err);
    return [];
  }
}

export { EXPLORER_API, PROGRAM_ID };
