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
  { name: 'obscura-aleo-mcp', version: '0.1.0' },
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
