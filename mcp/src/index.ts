#!/usr/bin/env node
/**
 * Obscura MCP Server
 *
 * Exposes Obscura auction operations as Model Context Protocol tools
 * so AI agents (Claude Desktop, ChatGPT with MCP support, etc.) can
 * create, browse, bid on, and settle private auctions on Aleo.
 *
 * First auction protocol with native AI-agent integration.
 *
 * Install:
 *   npm install -g obscura-aleo-mcp
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "obscura": {
 *         "command": "obscura-mcp"
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ObscuraClient, AUCTION_MODE, TOKEN_TYPE } from 'obscura-aleo-sdk';

const EXPLORER_API = process.env.EXPLORER_API ?? 'https://api.explorer.provable.com/v1';
const NETWORK = (process.env.NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const FRONTEND = 'https://obscura-auction-95hm.vercel.app';
const CORE_PROGRAM = 'obscura_core_v4.aleo';
const SETTLE_PROGRAM = 'obscura_settle_v6.aleo';
const DISPUTE_PROGRAM = 'obscura_dispute_v1.aleo';

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')).toString() + 'field';
}

function normalizeField(x: string): string {
  return x.endsWith('field') ? x : `${x}field`;
}

function aleoToMicro(amount: number): string {
  return `${Math.floor(amount * 1_000_000)}u128`;
}

const client = new ObscuraClient({ network: NETWORK, endpoint: EXPLORER_API });

const TOOLS: Tool[] = [
  {
    name: 'get_auction',
    description:
      'Read an Obscura auction by its auction_id. Returns format, status, deadline, token type, and bid count. Amounts stay private (sealed) until revealed.',
    inputSchema: {
      type: 'object',
      properties: {
        auction_id: {
          type: 'string',
          description: 'Auction field id (with or without trailing "field")',
        },
      },
      required: ['auction_id'],
    },
  },
  {
    name: 'get_dutch_price',
    description:
      'Get the CURRENT Dutch auction price at the latest block. Dutch auctions start high and drop linearly. First buyer wins at current price.',
    inputSchema: {
      type: 'object',
      properties: {
        auction_id: { type: 'string' },
      },
      required: ['auction_id'],
    },
  },
  {
    name: 'prepare_sealed_bid',
    description:
      'Prepare a sealed-bid transaction for the user to sign via their Aleo wallet. Returns functionName, inputs, and a random nonce. Bid amount stays private (never on-chain plaintext).',
    inputSchema: {
      type: 'object',
      properties: {
        auction_id: { type: 'string' },
        amount_aleo: {
          type: 'number',
          description: 'Bid amount in whole ALEO (e.g., 1.5 = 1_500_000 microcredits).',
        },
        token_type: {
          type: 'string',
          enum: ['ALEO', 'USDCX', 'USAD'],
          description: 'Token to bid with. Use ALEO for max privacy.',
        },
      },
      required: ['auction_id', 'amount_aleo'],
    },
  },
  {
    name: 'list_auction_formats',
    description:
      'List all 10 auction formats Obscura supports: Sealed, Vickrey, Dutch, English, Bundle, Multi-Unit, Candle, Reverse, Blind Dutch, Timed Escalation. Returns a concise description of each.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_privacy_model',
    description:
      'Describe Obscura privacy guarantees: what the observer learns at each phase. Useful for agents explaining privacy to users.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_deployed_contracts',
    description: 'Return the live Aleo testnet program IDs for all Obscura contracts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_browse_url',
    description:
      'Return the URL a human should visit to browse live Obscura auctions. For agents to direct users.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'prepare_file_dispute',
    description:
      'Prepare a dispute-filing payload for obscura_dispute_v1. Called when a settlement is contested. Requires a bond of at least 5 ALEO (paid from the caller\'s private credits record).',
    inputSchema: {
      type: 'object',
      properties: {
        auction_id: { type: 'string' },
        settlement_hash: { type: 'string', description: 'The on-chain settlement_proofs[auction_id] hash the disputer is challenging.' },
        bond_amount_aleo: { type: 'number', description: 'Dispute bond in ALEO (minimum 5).' },
      },
      required: ['auction_id', 'settlement_hash', 'bond_amount_aleo'],
    },
  },
  {
    name: 'prepare_juror_stake',
    description:
      'Prepare a juror-stake+commit-vote payload for obscura_dispute_v1. Juror locks >=1 ALEO bond and commits to a vote (upheld/rejected). Commitment is opened later via juror_reveal.',
    inputSchema: {
      type: 'object',
      properties: {
        auction_id: { type: 'string' },
        juror_slot: { type: 'integer', description: 'Slot 0, 1, or 2 (3 jurors required).' },
        stake_amount_aleo: { type: 'number', description: 'Stake in ALEO (min 1).' },
        vote_upheld: { type: 'boolean', description: 'true = dispute should be upheld, false = rejected.' },
      },
      required: ['auction_id', 'juror_slot', 'stake_amount_aleo', 'vote_upheld'],
    },
  },
  {
    name: 'get_dispute_status',
    description:
      'Read dispute state for an auction: jurors staked, votes revealed, current tally, status (OPEN / VOTING / REVEALING / RESOLVED_UPHELD / RESOLVED_REJECTED / EXPIRED).',
    inputSchema: {
      type: 'object',
      properties: { auction_id: { type: 'string' } },
      required: ['auction_id'],
    },
  },
  {
    name: 'explain_dispute_quorum',
    description:
      'Explain how obscura_dispute_v1 multi-voter economic quorum works. Useful for agents describing the dispute process to users.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const AUCTION_FORMATS = [
  { mode: AUCTION_MODE.FIRST_PRICE, name: 'Sealed Bid (First-Price)', fit: 'Generic sales, NFT drops' },
  { mode: AUCTION_MODE.VICKREY, name: 'Vickrey (Second-Price)', fit: 'Ad spend, truthful bidding' },
  { mode: AUCTION_MODE.DUTCH, name: 'Dutch Descending', fit: 'Token launches, liquidations' },
  { mode: AUCTION_MODE.ENGLISH, name: 'English Ascending', fit: 'Collectibles, open competition' },
  { mode: AUCTION_MODE.BUNDLE, name: 'Bundle (Combinatorial Subsets)', fit: 'Multi-item packages' },
  { mode: AUCTION_MODE.MULTI_UNIT, name: 'Multi-Unit Batch', fit: 'Token sales, batch fills' },
  { mode: 7, name: 'Candle (Random End)', fit: 'Anti-sniping, parachain slots' },
  { mode: 8, name: 'Reverse (Lowest Wins)', fit: 'Procurement, freelance bids' },
  { mode: 9, name: 'Blind Dutch', fit: 'Private price discovery' },
  { mode: 10, name: 'Timed Escalation', fit: 'Charity, fundraisers' },
];

const PRIVACY_MODEL = {
  bid_phase: {
    observer_learns: 'An auction exists. Nothing else. Zero tokens moved.',
    observer_does_not_learn: 'Bid amount, bidder identity, participation.',
  },
  reveal_phase: {
    observer_learns:
      'Which bid hashes revealed (flag only, no amount). Running max temporarily visible.',
    observer_does_not_learn: 'Bidder identity, long-term amount storage.',
  },
  settlement_phase: {
    observer_learns:
      'Settlement hash commitment. Winner bid hash. Running max DELETED post-settle.',
    observer_does_not_learn:
      'Final price (commit-only), winner address (self-identifies via claim), seller address (pseudonym).',
  },
  novel_primitives: [
    'BidderParticipationProof — non-transferable "I bid" proof',
    'AuctionCompletionProof — seller portable reputation record',
    'prove_won_auction — winner selective disclosure ZK proof',
    'Combinatorial subset bidding with ZK allocation',
  ],
};

const server = new Server(
  { name: 'obscura-aleo-mcp', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case 'get_auction': {
        const auction = await client.getAuction(String(args.auction_id));
        if (!auction) {
          return {
            content: [{ type: 'text', text: `Auction ${args.auction_id} not found on testnet.` }],
          };
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify(auction, null, 2) },
          ],
        };
      }

      case 'get_dutch_price': {
        const result = await client.getDutchCurrentPrice(String(args.auction_id));
        if (!result) {
          return {
            content: [{ type: 'text', text: 'Not a Dutch auction or auction not found.' }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Current Dutch price: ${client.formatAmount(result.price)} ALEO (at block ${result.blockHeight}).`,
            },
          ],
        };
      }

      case 'prepare_sealed_bid': {
        const amount = Number(args.amount_aleo);
        if (!Number.isFinite(amount) || amount <= 0) {
          return {
            content: [{ type: 'text', text: 'Invalid amount_aleo; must be a positive number.' }],
          };
        }
        const tokenMap: Record<string, number> = { ALEO: TOKEN_TYPE.ALEO, USDCX: TOKEN_TYPE.USDCX, USAD: TOKEN_TYPE.USAD };
        const token = tokenMap[String(args.token_type ?? 'ALEO').toUpperCase()] ?? TOKEN_TYPE.ALEO;
        const prepared = client.preparePlaceBid(String(args.auction_id), amount, token);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Have the user sign this via their Aleo wallet (Shield Wallet recommended).',
                  program: CORE_PROGRAM,
                  ...prepared,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'list_auction_formats':
        return {
          content: [{ type: 'text', text: JSON.stringify(AUCTION_FORMATS, null, 2) }],
        };

      case 'get_privacy_model':
        return {
          content: [{ type: 'text', text: JSON.stringify(PRIVACY_MODEL, null, 2) }],
        };

      case 'get_deployed_contracts':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  network: NETWORK,
                  core: CORE_PROGRAM,
                  settle_aleo: SETTLE_PROGRAM,
                  settle_stable: 'obscura_settle_stable_v4.aleo',
                  market: 'obscura_market_v2.aleo',
                  dispute: DISPUTE_PROGRAM,
                  explorer: 'https://testnet.explorer.provable.com',
                },
                null,
                2
              ),
            },
          ],
        };

      case 'get_browse_url':
        return {
          content: [{ type: 'text', text: `${FRONTEND}/browse` }],
        };

      case 'prepare_file_dispute': {
        const bond = Number(args.bond_amount_aleo);
        if (!Number.isFinite(bond) || bond < 5) {
          return {
            content: [{ type: 'text', text: 'bond_amount_aleo must be >= 5 ALEO.' }],
          };
        }
        const auction = normalizeField(String(args.auction_id));
        const settlement = normalizeField(String(args.settlement_hash));
        const payload = {
          message: 'Sign this file_dispute call via Shield Wallet. Requires a private credits record covering the bond.',
          program: DISPUTE_PROGRAM,
          functionName: 'file_dispute',
          inputs: [
            auction,
            settlement,
            aleoToMicro(bond),
            '<credits_record_placeholder>',
          ],
          notes: [
            'Replace <credits_record_placeholder> with a private credits.aleo::credits record whose balance >= bond.',
            'Returns: DisputeReceipt (save for later claim), change credits.',
            'After filing, 3 jurors must stake via prepare_juror_stake within the voting window (~8hr).',
          ],
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      }

      case 'prepare_juror_stake': {
        const slot = Number(args.juror_slot);
        const stake = Number(args.stake_amount_aleo);
        if (![0, 1, 2].includes(slot)) {
          return { content: [{ type: 'text', text: 'juror_slot must be 0, 1, or 2.' }] };
        }
        if (!Number.isFinite(stake) || stake < 1) {
          return { content: [{ type: 'text', text: 'stake_amount_aleo must be >= 1 ALEO.' }] };
        }
        const auction = normalizeField(String(args.auction_id));
        const nonce = randomNonce();
        const payload = {
          message: 'Sign this juror_stake call. The vote is committed now; reveal via juror_reveal after 3 jurors have staked.',
          program: DISPUTE_PROGRAM,
          functionName: 'juror_stake',
          inputs: [
            auction,
            `${slot}u8`,
            aleoToMicro(stake),
            String(args.vote_upheld) === 'true' ? 'true' : 'false',
            nonce,
            '<credits_record_placeholder>',
          ],
          vote_nonce: nonce,
          notes: [
            'SAVE vote_nonce — required for juror_reveal later.',
            'Replace <credits_record_placeholder> with a private credits record covering the stake.',
            'Returns: JurorBond (keep for reveal + claim), change credits.',
          ],
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      }

      case 'get_dispute_status': {
        const auction = normalizeField(String(args.auction_id));
        const url = `${EXPLORER_API}/${NETWORK}/program/${DISPUTE_PROGRAM}/mapping/disputes/${encodeURIComponent(auction)}`;
        try {
          const res = await fetch(url);
          if (!res.ok) {
            return { content: [{ type: 'text', text: `No dispute found for auction ${args.auction_id}.` }] };
          }
          const raw = await res.text();
          return {
            content: [
              {
                type: 'text',
                text: `Dispute state (raw Aleo encoding):\n${raw}\n\nStatus codes:\n1 OPEN (accepting juror stakes)\n2 VOTING (commit phase closed)\n3 REVEALING (jurors opening votes)\n4 RESOLVED_UPHELD\n5 RESOLVED_REJECTED\n6 EXPIRED`,
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: 'text', text: `Fetch error: ${err instanceof Error ? err.message : String(err)}` }] };
        }
      }

      case 'explain_dispute_quorum':
        return {
          content: [
            {
              type: 'text',
              text: `\
obscura_dispute_v1 — Multi-Voter Economic Quorum

STEP 1. Disputer files via file_dispute(auction_id, settlement_hash, bond) with >=5 ALEO bond.
         State: OPEN. Voting window opens for ~8 hours.

STEP 2. Three jurors independently call juror_stake(slot, stake, vote, nonce).
         Each juror locks >=1 ALEO and commits to a vote (upheld/rejected) via BHP256.
         When slot #3 is filled, status flips to REVEALING.

STEP 3. Reveal window (~4 hours): jurors call juror_reveal(bond, upheld).
         Contract verifies BHP256(upheld, nonce) matches the stored commit.

STEP 4. After reveal window: anyone calls resolve_quorum(auction_id).
         Status → RESOLVED_UPHELD or RESOLVED_REJECTED based on majority.
         5% of bond pool → treasury. Remaining → correct jurors.

STEP 5. Correct jurors call juror_claim(bond, voted_upheld) to collect 1.5× their original stake.
         Wrong jurors lose their stake (economic slashing).

PRIVACY: disputer_hash and juror commits are BHP256 only — identities never plaintext.
NOVEL: First Aleo auction protocol with decentralized dispute resolution.
`,
            },
          ],
        };

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error calling ${name}: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Obscura MCP server running on stdio.');
}

main().catch((err) => {
  console.error('MCP server fatal:', err);
  process.exit(1);
});
