# obscura-aleo-cli

Command-line interface for **Obscura** — privacy-first sealed-bid auction protocol on Aleo.

## Install

```bash
npm install -g obscura-aleo-cli
```

## Quick start

```bash
# Inspect an auction
obscura auction 7123...field

# Current Dutch auction price
obscura dutch-price 7123field

# Prepare a wallet-signable bid payload (1.5 ALEO)
obscura prepare-bid 7123 1.5 --token=ALEO

# List all 10 supported auction formats
obscura formats

# Print deployed program IDs
obscura contracts

# Show Obscura privacy model summary
obscura privacy
```

## Environment variables

```bash
OBSCURA_NETWORK=testnet                              # default
OBSCURA_ENDPOINT=https://api.explorer.provable.com/v1
```

## Deployed contracts (Aleo testnet)

- `obscura_core_v4.aleo` — 10 auction formats, Privacy 9.5
- `obscura_settle_v6.aleo` — commit-based settlements
- `obscura_settle_stable_v4.aleo` — USDCx + USAD
- `obscura_market_v2.aleo` — fixed sales + RFQ

## Related packages

- [`obscura-aleo-sdk`](https://www.npmjs.com/package/obscura-aleo-sdk) — TypeScript SDK
- [`obscura-aleo-mcp`](https://www.npmjs.com/package/obscura-aleo-mcp) — MCP server for AI agents
- Web: https://obscura-auction-95hm.vercel.app

MIT License.
