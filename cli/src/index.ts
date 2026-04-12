#!/usr/bin/env node
/**
 * obscura — command-line interface for Obscura private auctions on Aleo.
 *
 * Install:
 *   npm install -g obscura-aleo-cli
 *
 * Usage:
 *   obscura auction <auction_id>        Inspect an auction.
 *   obscura dutch-price <auction_id>    Compute current Dutch price at latest block.
 *   obscura formats                     List all 10 auction formats.
 *   obscura contracts                   Print deployed program IDs.
 *   obscura privacy                     Print Obscura privacy model summary.
 *   obscura prepare-bid <auction_id> <amount_aleo> [--token=ALEO|USDCX|USAD]
 *                                       Prepare a place_bid payload (ready for wallet signing).
 *   obscura browse                      Open live auctions in browser.
 *   obscura version                     Print CLI version.
 *   obscura help                        Show this help.
 */

import { ObscuraClient, AUCTION_MODE, TOKEN_TYPE } from 'obscura-aleo-sdk';

const NETWORK = (process.env.OBSCURA_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const ENDPOINT = process.env.OBSCURA_ENDPOINT ?? 'https://api.explorer.provable.com/v1';
const FRONTEND = 'https://obscura-auction-95hm.vercel.app';
const CORE = 'obscura_core_v4.aleo';
const SETTLE = 'obscura_settle_v6.aleo';
const SETTLE_STABLE = 'obscura_settle_stable_v4.aleo';
const MARKET = 'obscura_market_v2.aleo';
const VERSION = '0.1.0';

const FORMATS = [
  'Sealed (First-Price) — highest wins, pays own bid',
  'Vickrey (Second-Price) — highest wins, pays 2nd',
  'Dutch — descending price, first buyer wins',
  'English — open ascending bids, anti-snipe',
  'Bundle — 2-4 items, combinatorial subset bidding',
  'Multi-Unit — N identical units, quantity + price',
  'Candle — random end block, kills sniping',
  'Reverse — lowest bid wins (procurement/RFP)',
  'Blind Dutch — descending price + sealed bids',
  'Timed Escalation — auto-increment per period',
];

const PRIVACY_SUMMARY = `\
Obscura Privacy Model (v4 core + v6 settle)
─────────────────────────────────────────
Bid phase      : Zero tokens move. Bid amount only in private SealedBid record.
                 Observer learns: auction exists. Nothing else.
Reveal phase   : revealed_bids stores bool flag only. Amount committed in bid_hash.
                 Running max visible during reveal window, DELETED post-settle (v6).
                 BidderParticipationProof record issued (Fairdrop-match PoP).
Settle phase   : settlements mapping stores price_commit: field (BHP256 hiding).
                 NO plaintext price/fee anywhere in permanent state.
                 AuctionCompletionProof record issued to seller (novel).
Post-settle    : Only hashes on-chain. Winner can prove_won_auction selectively.
Platform limits: credits.aleo transfer amount visible (inherent Aleo constraint).
                 USDCx/USAD use public transfers (stablecoin compliance model).`;

function formatArg(id: string) {
  return id.endsWith('field') ? id : `${id}field`;
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v = 'true'] = a.slice(2).split('=');
      flags[k] = v;
    } else positional.push(a);
  }
  return { flags, positional };
}

function help() {
  console.log(`\
obscura v${VERSION} — CLI for private auctions on Aleo

Usage:
  obscura auction <auction_id>              Inspect auction state
  obscura dutch-price <auction_id>          Current Dutch auction price
  obscura prepare-bid <id> <amt> [--token]  Prepare wallet-signable bid payload
  obscura formats                           List all 10 auction formats
  obscura contracts                         Print deployed program IDs
  obscura privacy                           Privacy model summary
  obscura browse                            Print live auctions URL
  obscura version                           Print CLI version
  obscura help                              Show this help

Env:
  OBSCURA_NETWORK=testnet                   Network (default: testnet)
  OBSCURA_ENDPOINT=https://...              Custom RPC endpoint

Examples:
  obscura auction 7123...field
  obscura dutch-price 7123field
  obscura prepare-bid 7123 1.5 --token=ALEO`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    help();
    return;
  }

  if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
    console.log(`obscura-aleo-cli v${VERSION}`);
    return;
  }

  if (cmd === 'formats') {
    console.log('10 auction formats supported by Obscura:');
    FORMATS.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    return;
  }

  if (cmd === 'contracts') {
    console.log(`Network:       ${NETWORK}`);
    console.log(`Core:          ${CORE}`);
    console.log(`Settle ALEO:   ${SETTLE}`);
    console.log(`Settle Stable: ${SETTLE_STABLE}`);
    console.log(`Market:        ${MARKET}`);
    console.log(`Explorer:      https://${NETWORK}.explorer.provable.com/program/${CORE}`);
    return;
  }

  if (cmd === 'privacy') {
    console.log(PRIVACY_SUMMARY);
    return;
  }

  if (cmd === 'browse') {
    console.log(`Live auctions: ${FRONTEND}/browse`);
    return;
  }

  const client = new ObscuraClient({ network: NETWORK, endpoint: ENDPOINT });
  const { flags, positional } = parseArgs(rest);

  if (cmd === 'auction') {
    const id = positional[0];
    if (!id) {
      console.error('Missing auction_id. Usage: obscura auction <auction_id>');
      process.exit(1);
    }
    const a = await client.getAuction(formatArg(id));
    if (!a) {
      console.error(`Auction ${id} not found.`);
      process.exit(1);
    }
    console.log(JSON.stringify(a, null, 2));
    return;
  }

  if (cmd === 'dutch-price') {
    const id = positional[0];
    if (!id) {
      console.error('Missing auction_id. Usage: obscura dutch-price <auction_id>');
      process.exit(1);
    }
    const r = await client.getDutchCurrentPrice(formatArg(id));
    if (!r) {
      console.error('Not a Dutch auction or not found.');
      process.exit(1);
    }
    console.log(`Current price: ${client.formatAmount(r.price)} ALEO (block ${r.blockHeight})`);
    return;
  }

  if (cmd === 'prepare-bid') {
    const [id, amountStr] = positional;
    if (!id || !amountStr) {
      console.error('Usage: obscura prepare-bid <auction_id> <amount_aleo> [--token=ALEO|USDCX|USAD]');
      process.exit(1);
    }
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('amount_aleo must be a positive number.');
      process.exit(1);
    }
    const tokenMap: Record<string, number> = {
      ALEO: TOKEN_TYPE.ALEO,
      USDCX: TOKEN_TYPE.USDCX,
      USAD: TOKEN_TYPE.USAD,
    };
    const tokenKey = (flags.token ?? 'ALEO').toUpperCase();
    const token = tokenMap[tokenKey] ?? TOKEN_TYPE.ALEO;
    const prepared = client.preparePlaceBid(formatArg(id), amount, token);
    const payload = {
      program: CORE,
      token: tokenKey,
      ...prepared,
    };
    console.log(JSON.stringify(payload, null, 2));
    console.log('\nℹ️  Sign this via Shield Wallet or snarkos to submit.');
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  help();
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
