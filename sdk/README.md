# @obscura/sdk

TypeScript SDK for the Obscura multi-format privacy auction protocol on Aleo.

## Install

```bash
npm install @obscura/sdk
```

## Quick Start

```typescript
import { ObscuraClient, AUCTION_MODE, TOKEN_TYPE } from '@obscura/sdk';

const client = new ObscuraClient({ network: 'testnet' });

// Read an auction
const auction = await client.getAuction('1234...field');
console.log(auction?.mode_label);  // "Dutch (Descending)"
console.log(auction?.status_label); // "active"

// Get current Dutch price
const price = await client.getDutchCurrentPrice('1234...field');
console.log(`Current price: ${client.formatAmount(price!.price)} ALEO`);

// Prepare a sealed bid for wallet execution
const { functionName, inputs, nonce } = client.preparePlaceBid(
  '1234...field',
  1.5,  // 1.5 ALEO
  TOKEN_TYPE.ALEO
);
// Save `nonce` — you'll need it for reveal_bid
```

## API Reference

### Constructor

```typescript
const client = new ObscuraClient({
  network: 'testnet',          // 'testnet' | 'mainnet'
  programId: 'obscura_v4.aleo', // default
  endpoint: 'https://api.explorer.provable.com/v1'
});
```

### Read Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getAuction(id)` | `ParsedAuction \| null` | Full auction data with computed labels |
| `getHighestBid(id)` | `bigint` | Current highest bid amount |
| `getSecondHighestBid(id)` | `bigint` | Second-highest (Vickrey settlement price) |
| `getWinner(id)` | `string \| null` | Winner's bid hash |
| `getDutchConfig(id)` | `DutchConfig \| null` | Start/end price schedule |
| `getDutchCurrentPrice(id)` | `{ price, blockHeight }` | Live Dutch price |
| `getSettlement(id)` | `SettlementData \| null` | Settlement details |
| `getDispute(id)` | `DisputeData \| null` | Active dispute info |
| `getTreasuryBalance(tokenType)` | `bigint` | Platform fee balance |
| `getBlockHeight()` | `number` | Current block height |
| `isDisputable(id)` | `boolean` | Within dispute window? |

### Prepare Methods (for wallet execution)

| Method | Returns | Description |
|--------|---------|-------------|
| `prepareCreateAuction(params)` | `{ functionName, inputs }` | Sealed/English/Vickrey |
| `prepareCreateDutchAuction(params)` | `{ functionName, inputs }` | Dutch auction |
| `preparePlaceBid(id, amount, token)` | `{ functionName, inputs, nonce }` | Sealed bid |
| `prepareBidDutch(id, maxPrice)` | `{ functionName, inputs, nonce }` | Dutch instant buy |
| `prepareBidEnglish(id, amount)` | `{ functionName, inputs, nonce }` | English ascending |

### Utility Exports

```typescript
import {
  hashStringToField,    // Hash title to on-chain item_hash
  generateNonce,         // Random cryptographic nonce
  toMicrocredits,        // 1.5 → "1500000u128"
  fromMicrocredits,      // 1500000n → 1.5
  computeDutchPrice,     // Client-side price computation
  truncateId,            // "1234...field" → "1234...ield"
} from '@obscura/sdk';
```

## Supported Auction Modes

| Mode | Constant | Flow |
|------|----------|------|
| First-Price Sealed | `AUCTION_MODE.FIRST_PRICE` | bid → reveal → finalize → claim |
| Vickrey (2nd-Price) | `AUCTION_MODE.VICKREY` | bid → reveal → finalize → claim (pays 2nd price) |
| Dutch (Descending) | `AUCTION_MODE.DUTCH` | bid (instant win) → claim |
| English (Ascending) | `AUCTION_MODE.ENGLISH` | bid → bid → ... → settle → claim |

## Supported Tokens

| Token | Constant | On-chain Program |
|-------|----------|-----------------|
| ALEO Credits | `TOKEN_TYPE.ALEO` | `credits.aleo` |
| USDCx | `TOKEN_TYPE.USDCX` | `test_usdcx_stablecoin.aleo` |
| USAD | `TOKEN_TYPE.USAD` | `test_usad_stablecoin.aleo` |
