# obscura-aleo-mcp

Model Context Protocol server for **Obscura** — lets AI agents (Claude Desktop, ChatGPT with MCP support, and others) create, browse, bid on, and settle private auctions on Aleo.

**First auction protocol on Aleo with native AI-agent integration.**

## Install

```bash
npm install -g obscura-aleo-mcp
```

## Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obscura": {
      "command": "obscura-mcp"
    }
  }
}
```

Restart Claude Desktop. Obscura tools will appear automatically.

## Tools exposed

- `get_auction(auction_id)` — read auction state
- `get_dutch_price(auction_id)` — current Dutch auction price
- `prepare_sealed_bid(auction_id, amount_aleo, token_type)` — build a signed bid
- `list_auction_formats` — all 10 supported formats
- `get_privacy_model` — Obscura privacy guarantees at each phase
- `get_deployed_contracts` — live Aleo testnet program IDs
- `get_browse_url` — URL to browse live auctions

## Example prompts to Claude

> "What auctions are currently live on Obscura?"
>
> "Create a Vickrey auction for my NFT with reserve 5 ALEO, 4-hour deadline."
>
> "What's the current Dutch auction price for 123field?"
>
> "Explain Obscura privacy guarantees during the bidding phase."

Claude will call the MCP tools under the hood.

## Network

Defaults to Aleo testnet. Override with env vars:

```bash
NETWORK=testnet
EXPLORER_API=https://api.explorer.provable.com/v1
```

## Links

- Live app: https://obscura-auction-95hm.vercel.app
- SDK: https://www.npmjs.com/package/obscura-aleo-sdk
- GitHub: https://github.com/Ritik200238/obscura-auction

MIT License.
