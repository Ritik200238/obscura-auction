# Obscura — Privacy-First Sealed-Bid Vickrey Auction Protocol on Aleo

> First implementation of second-price (Vickrey) auctions with zero-knowledge proofs on Aleo.

**[Live Demo](https://obscura-auction-95hm.vercel.app)** | **[Contract on Explorer](https://testnet.explorer.provable.com/program/obscura_v3.aleo)** | **[Deploy TX](https://testnet.explorer.provable.com/transaction/at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a)** | **Shield Wallet Required**

![Obscura Hero](./frontend/public/screenshot-hero.png)

---

## What is Obscura?

Obscura is a sealed-bid auction protocol on Aleo where bid amounts are cryptographically invisible during the bidding phase, bidder identities are never stored on-chain, and the winner self-identifies by proving ownership of a private record. It supports both first-price and Vickrey (second-price) auctions with full token escrow via `credits.aleo` and `test_usdcx_stablecoin.aleo`. The commit-reveal architecture ensures no party — not the seller, not the platform, not other bidders — can see bid amounts until the reveal phase, when disclosure is intentional and voluntary.

---

## Architecture

![Obscura Architecture](./frontend/public/architecture.svg)

---

## Privacy Model

| Data | During Bidding | After Reveal | Mechanism |
|------|---------------|--------------|-----------|
| Bid Amounts | **Private** — encrypted in SealedBid record | Public (intentional) | No token transfer at bid time; commit-reveal with BHP256 |
| Bidder Identity | **Private** — never on-chain | **Private** — never on-chain | Address used only in off-chain transition scope; record ownership |
| Reserve Price | **Private** — hash only on-chain | Verified at settlement | `BHP256(reserve_price)` stored; seller re-proves at finalize |
| Seller Address | **Private** — hash only on-chain | **Private** — hash only | `BHP256(address as field)` — computationally infeasible to reverse |
| Winner Identity | **Private** — unknown | **Private** — self-disclosed only | `prove_won_auction` selective disclosure via ZK proof |
| Payment Records | N/A | **Private** — UTXO credits | `transfer_public_to_private` creates encrypted credit records |
| Item Details | **Private** — BHP256 hash on-chain | **Private** — hash only | Title/description stored encrypted in backend, not on-chain |

**Key design choice**: No tokens move during `place_bid`. An observer watching `credits.aleo` transfers learns nothing about bid amounts during the sealed phase. Token escrow happens at `reveal_bid`, when amounts are intentionally public.

---

## How It Works

### Step 1: Create Auction
Seller calls `create_auction` with item hash, category, reserve price, auction mode (First-Price or Vickrey), token type (ALEO or USDCx), and deadline. The reserve price is stored as a BHP256 hash — only the seller knows the actual value. The seller's address is hashed, never stored in plaintext.

### Step 2: Place Sealed Bid
Bidders call `place_bid` with their bid amount and a random nonce. A BHP256 commitment hash is stored on-chain (prevents replay), but the bid amount is encrypted inside a private `SealedBid` record. **No tokens are transferred** — this is the privacy innovation. Anti-sniping protection extends the deadline by ~10 minutes for bids placed in the final ~10 minutes.

### Step 3: Reveal Bid + Escrow
After bidding closes, bidders call `reveal_bid` to prove their commitment and escrow tokens atomically. The `SealedBid` record is consumed (UTXO model prevents double-reveal). Highest and second-highest bids are tracked on-chain for Vickrey support.

### Step 4: Finalize Auction
The seller calls `finalize_auction`, re-entering the reserve price (verified against the stored hash). If the highest bid meets the reserve, the auction settles. If it's a Vickrey auction and fewer than 2 bids revealed, it fails. A tamper-evident `settlement_proof` hash is stored on-chain.

### Step 5: Claim / Refund
- **Winner** calls `claim_win` (first-price) or `claim_win_vickrey` (second-price). Seller receives private ALEO credits or public USDCx. Winner gets a `WinnerCertificate` record. In Vickrey mode, the winner is refunded the difference between their bid and the second-highest.
- **Losers** call `claim_refund` to reclaim their escrowed tokens as private credits.
- **Winner can prove ownership** later via `prove_won_auction` — a selective disclosure ZK proof that reveals nothing about the bid amount.

![Obscura Features and Lifecycle](./frontend/public/screenshot-features.png)

---

## Vickrey (Second-Price) Auctions

In a standard first-price auction, rational bidders shade their bids below their true valuation to protect surplus. This leads to inefficient markets. In a Vickrey auction, the winner pays the **second-highest bid**, not their own. This makes bidding your true valuation a **dominant strategy** — optimal regardless of what others do.

**Why ZK is required**: Traditional Vickrey auctions require trusting the auctioneer to honestly report the second price. With Obscura, the `second_highest_bids` mapping is updated atomically in on-chain finalize logic — no party can manipulate it. Any observer can verify the second price on-chain.

**Real-world usage**: Google Ads (generalized second-price), US Treasury auctions, FCC spectrum auctions, ICANN domain sales — all use Vickrey-style mechanisms for optimal price discovery.

See [VICKREY_EXPLAINER.md](./VICKREY_EXPLAINER.md) for the full game-theoretic analysis with worked examples.

---

## Token Support

| Token | Deposit (Escrow) | Payout | Privacy Level |
|-------|-----------------|--------|---------------|
| **ALEO Credits** | `credits.aleo/transfer_private_to_public` | `credits.aleo/transfer_public_to_private` | Full privacy — private records in, private records out |
| **USDCx Stablecoin** | `test_usdcx_stablecoin.aleo/transfer_public_as_signer` | `test_usdcx_stablecoin.aleo/transfer_public` | Public balance transfers |

ALEO path: Bidder's private credits record → program's public balance (escrow) → private credits record (payout to seller/refund). The sender and recipient are hidden in both directions.

USDCx path: Bidder's public USDCx balance → program's public balance (escrow) → recipient's public balance (payout). USDCx uses public balances by design.

---

## Smart Contract Architecture

**Program**: `obscura_v3.aleo` — deployed on Aleo Testnet

```
Transitions:    17 (+ constructor = 18 total)
Records:         4 (all private, UTXO consumption model)
Mappings:       13 (minimal public exposure — hashes and counters only)
Structs:         7
State Machine:   8 states
Tokens:         credits.aleo + test_usdcx_stablecoin.aleo
```

### All 17 Transitions

| # | Transition | Token | Purpose | Records Affected | Privacy |
|---|-----------|-------|---------|-----------------|---------|
| 1 | `initialize_platform` | — | One-time setup (admin hash, fee %, pause) | — | Admin hash stored, not address |
| 2 | `create_auction` | — | Create auction (any mode/token) | — | Seller address hashed via BHP256 |
| 3 | `cancel_auction` | — | Cancel (0 bids, seller only) | — | Seller verified via hash |
| 4 | `close_bidding` | — | Start reveal phase or expire | — | Anyone can call after deadline |
| 5 | `place_bid` | — | Submit sealed bid commitment | Creates `SealedBid` | **No token transfer** — amount fully private |
| 6 | `reveal_bid` | ALEO | Reveal + escrow (atomic) | Consumes `SealedBid`, creates `EscrowReceipt` | Amount intentionally public at reveal |
| 7 | `reveal_bid_usdcx` | USDCx | Reveal + escrow (USDCx) | Consumes `SealedBid`, creates `EscrowReceipt` | Amount intentionally public at reveal |
| 8 | `finalize_auction` | — | Determine winner, check reserve | — | Reserve verified via hash; settlement proof stored |
| 9 | `claim_win` | ALEO | First-price settlement | Consumes `EscrowReceipt`, creates `WinnerCertificate` + `SellerReceipt` | Seller gets private credits; payment proof stored |
| 10 | `claim_win_usdcx` | USDCx | First-price settlement (USDCx) | Consumes `EscrowReceipt`, creates `WinnerCertificate` + `SellerReceipt` | Seller gets public USDCx |
| 11 | `claim_win_vickrey` | ALEO | Second-price settlement + refund | Consumes `EscrowReceipt`, creates `WinnerCertificate` + `SellerReceipt` | Winner refunded difference as private credits |
| 12 | `claim_win_vickrey_usdcx` | USDCx | Second-price settlement + refund (USDCx) | Consumes `EscrowReceipt`, creates `WinnerCertificate` + `SellerReceipt` | Winner refunded difference as public USDCx |
| 13 | `claim_refund` | ALEO | Loser reclaims escrow | Consumes `EscrowReceipt` | Private credits returned |
| 14 | `claim_refund_usdcx` | USDCx | Loser reclaims escrow (USDCx) | Consumes `EscrowReceipt` | Public USDCx returned |
| 15 | `withdraw_fees` | ALEO | Admin withdraws accumulated fees | — | Admin verified via hash |
| 16 | `withdraw_fees_usdcx` | USDCx | Admin withdraws fees (USDCx) | — | Admin verified via hash |
| 17 | `prove_won_auction` | — | Selective disclosure (ZK proof of winning) | Returns `WinnerCertificate` (not consumed) | Proves ownership without revealing amount |

### Records (4 — All Private)

| Record | Created By | Contains | Consumed By |
|--------|-----------|----------|-------------|
| `SealedBid` | `place_bid` | auction_id, bid_amount, bid_nonce, token_type | `reveal_bid` / `reveal_bid_usdcx` |
| `EscrowReceipt` | `reveal_bid` / `reveal_bid_usdcx` | auction_id, escrowed_amount, bid_nonce, token_type | `claim_win*` / `claim_refund*` |
| `WinnerCertificate` | `claim_win*` | auction_id, item_hash, winning_amount, token_type, certificate_id | Never consumed (kept as proof) |
| `SellerReceipt` | `claim_win*` | auction_id, item_hash, sale_amount, fee_paid, token_type | Never consumed (kept as proof) |

### Mappings (13)

| Mapping | Key | Value | Purpose |
|---------|-----|-------|---------|
| `auctions` | field | AuctionData | Core auction state (hashes, status, deadlines) |
| `bid_commitments` | field | bool | Replay prevention — stores commitment hashes |
| `revealed_bids` | field | u128 | Post-reveal bid amounts |
| `highest_bids` | field | u128 | Highest revealed bid per auction |
| `second_highest_bids` | field | u128 | Second-highest for Vickrey |
| `auction_winners` | field | field | Winner's bid hash (not address) |
| `program_balance` | u8 | u128 | Pooled program balance by token type |
| `auction_escrow` | field | u128 | Per-auction escrowed total |
| `platform_treasury` | u8 | u128 | Accumulated fees by token type |
| `settlements` | field | SettlementData | Double-settlement prevention |
| `platform_config` | u8 | PlatformConfig | Admin hash, fee rates, pause state |
| `settlement_proofs` | field | field | BHP256 hash of SettlementProof — tamper-evident |
| `payment_proofs` | field | field | BHP256 commit of payment amount — verifiable |

### State Machine (8 States)

```
                 ┌──────────┐
                 │  ACTIVE   │ ← create_auction
                 │   (1)     │   Accepting bids (anti-snipe extends deadline)
                 └─────┬─────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
  cancel_auction   close_bidding   close_bidding
  (0 bids only)    (has bids)      (0 bids)
       │               │               │
       ▼               ▼               ▼
 ┌───────────┐  ┌────────────┐  ┌───────────┐
 │ CANCELLED │  │ REVEALING  │  │  EXPIRED  │
 │    (5)    │  │    (3)     │  │    (8)    │
 └───────────┘  └─────┬──────┘  └───────────┘
                      │
           ┌──────────┼──────────┐
           │                     │
    finalize_auction      finalize_auction
    (reserve met)         (reserve NOT met
           │               OR Vickrey < 2 reveals)
           ▼                     │
    ┌────────────┐        ┌──────────┐
    │  SETTLED   │        │  FAILED  │
    │    (4)     │        │   (6)    │
    └─────┬──────┘        └──────────┘
          │
    claim_win / claim_win_vickrey
    claim_refund (losers)
```

Additional reserved states: CLOSED (2), DISPUTED (7) — planned for future dispute mechanism.

---

## Security Features

| Feature | Mechanism | Protection Against |
|---------|-----------|-------------------|
| **Anti-Sniping** | 40-block window (~10 min) — bids in final window extend deadline | Last-second bid manipulation |
| **Commit-Reveal Integrity** | `BHP256(BidCommitment)` stored at bid time, verified at reveal | Bid amount tampering after placement |
| **Double-Settlement Guard** | `settlements` mapping + `assert(!already_settled)` | Winner claiming twice |
| **Winner Double-Spend Block** | `claim_refund` checks `bid_hash != auction_winners[id]` | Winner also claiming refund |
| **Bid Replay Prevention** | `bid_commitments` mapping + unique nonce per bid | Duplicate bid submission |
| **Settlement Proofs** | `BHP256(SettlementProof{...})` stored in `settlement_proofs` mapping | Retroactive result tampering |
| **Payment Proofs** | `BHP256::commit_to_field(amount, nonce_scalar)` in `payment_proofs` | Verifiable payment without revealing nonce |
| **Selective Disclosure** | `prove_won_auction` — ZK proof of WinnerCertificate ownership | Proving you won without revealing amount |
| **Reserve Hash Verification** | `BHP256(reserve_price) == stored_hash` checked at finalize | Seller lying about reserve price |
| **UTXO Record Consumption** | SealedBid and EscrowReceipt consumed on use (Aleo's model) | Double-reveal, double-refund |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contract** | Leo (Aleo's ZK language) — 17 transitions, `credits.aleo` + `test_usdcx_stablecoin.aleo` |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Zustand, Framer Motion |
| **Backend** | Express, TypeScript, AES-256-GCM per-column encryption, Upstash Redis |
| **Wallet** | Shield Wallet via `@provablehq/aleo-wallet-adaptor-react` (delegated proving) |
| **Network** | Aleo Testnet |
| **Hosting** | Vercel (frontend + backend serverless) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- [Shield Wallet](https://shieldwallet.io/) browser extension (switch to Testnet)
- Aleo testnet credits ([faucet](https://faucet.aleo.org))

### Run Locally

```bash
# Clone
git clone https://github.com/Ritik200238/obscura-auction.git
cd obscura-auction

# Frontend
cd frontend
npm install --legacy-peer-deps
cp .env.example .env   # Set VITE_BACKEND_URL if running backend locally
npm run dev
# Opens at http://localhost:5173

# Backend (separate terminal)
cd backend
npm install
cp .env.example .env   # Set ENCRYPTION_KEY, KV_REST_API_URL, KV_REST_API_TOKEN
npm run dev
# API at http://localhost:3001
```

### Build Smart Contract
```bash
cd contracts/obscura_auction
leo build --network testnet --endpoint https://api.explorer.provable.com/v1
```

---

## Demo Guide

### As a Seller

1. **Connect Shield Wallet** — Click "Connect Wallet" in the top navigation. Ensure you're on Aleo Testnet with sufficient credits.

2. **Create Auction** — Navigate to `/create`. Fill in:
   - Item title and description (stored encrypted off-chain)
   - Category (Art, Collectible, Service, Other)
   - Reserve price in ALEO or USDCx (stored as BHP256 hash on-chain)
   - Auction mode: **First-Price** or **Vickrey (2nd-Price)** — Vickrey is highlighted as "First on Aleo"
   - Token type: ALEO Credits or USDCx Stablecoin
   - Duration (1h to 7d)
   - You can also use Quick Templates (Digital Art, Collectible, Service) to auto-fill

3. **Submit Transaction** — Click "Create Auction". Shield Wallet will prompt for signature. After confirmation, the page shows your transaction ID and the on-chain auction ID. **Copy the auction ID** — bidders need this to find your auction.

4. **Wait for Bids** — Share the auction ID. Bidders place sealed bids during the active phase. You can monitor on the auction detail page (`/auction/{id}`).

5. **Close Bidding** — After the deadline passes, anyone can click "Close Bidding" on the auction detail page. This starts the reveal phase (~12 hours).

6. **Finalize Auction** — After the reveal deadline passes, navigate to the auction detail page. The "Settle" panel appears. **Re-enter your exact reserve price** (the contract verifies `BHP256(input) == stored_hash`). If the highest bid meets your reserve, the auction settles.

7. **Receive Payment** — When the winner calls `claim_win`, you receive a `SellerReceipt` record and payment as private ALEO credits (or public USDCx). Check your receipt in the My Activity page.

### As a Bidder

1. **Connect Shield Wallet** — Ensure you have testnet ALEO credits or USDCx balance.

2. **Find Auction** — Navigate to `/browse`. Search by auction ID, filter by status/token/mode, or enter an auction ID directly in the "On-Chain Lookup" field.

3. **Place Sealed Bid** — On the auction detail page (`/auction/{id}`), use the Bid panel. Enter your bid amount. The transaction creates a private `SealedBid` record — **no tokens are transferred yet**, and your bid amount is invisible to everyone. Note the anti-sniping indicator if it's near the deadline.

4. **Reveal Bid** — After bidding closes and the auction enters the REVEALING phase, use the Reveal panel. This consumes your `SealedBid` record, proves your commitment, and escrows your tokens. Your bid amount becomes public (this is the purpose of the reveal phase).

5. **If You Win (First-Price)** — The auction detail page shows the Claim panel. Click "Claim Win". You receive a `WinnerCertificate` record. The seller receives payment minus a 1% platform fee.

6. **If You Win (Vickrey)** — Same as above, but you pay the **second-highest bid** instead of your own. The difference is automatically refunded to your wallet as private credits.

7. **If You Lose** — Use the Refund panel to reclaim your escrowed tokens. They return as private ALEO credits (or public USDCx).

8. **Check Records** — Visit `/my-activity` to see your Sealed Bids, Escrow Receipts, and Winner Certificates. Each record links to its auction.

---

## Deployed Contract

| Field | Value |
|-------|-------|
| **Program ID** | `obscura_v3.aleo` |
| **Network** | Aleo Testnet |
| **Deploy TX** | [`at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a`](https://testnet.explorer.provable.com/transaction/at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a) |
| **Initialize TX** | [`at1ugfznxv9dufgatesere2gkstvph492f3ykd6sj4ajdjqazmgvgrs97myfu`](https://testnet.explorer.provable.com/transaction/at1ugfznxv9dufgatesere2gkstvph492f3ykd6sj4ajdjqazmgvgrs97myfu) |
| **Platform Config** | fee_bps=100 (1%), dispute_bond_bps=500 (5%), paused=false |
| **Dependencies** | `credits.aleo`, `test_usdcx_stablecoin.aleo` |
| **Explorer** | [View on Explorer](https://testnet.explorer.provable.com/program/obscura_v3.aleo) |

### Verified Test Transactions

| Action | TX ID |
|--------|-------|
| Create Auction | [`at14fpq6yazt7cye9pmhhuk6vgtem8zcxezc5p5yczndhmy43v0mv9qdn8qu2`](https://testnet.explorer.provable.com/transaction/at14fpq6yazt7cye9pmhhuk6vgtem8zcxezc5p5yczndhmy43v0mv9qdn8qu2) |
| Place Bid | [`at1nkl2w4jsztcqfqhue7ua5tmkksaze686xqmtkg0rd0g8jznwxqrqj8prxk`](https://testnet.explorer.provable.com/transaction/at1nkl2w4jsztcqfqhue7ua5tmkksaze686xqmtkg0rd0g8jznwxqrqj8prxk) |
| Close Bidding | [`at1enwthmddswqajfkctjpuwdzy7924fm6s2yqnxrydf3d97xs745qseg5ym5`](https://testnet.explorer.provable.com/transaction/at1enwthmddswqajfkctjpuwdzy7924fm6s2yqnxrydf3d97xs745qseg5ym5) |
| Reveal Bid | [`at1tz3fs6t82vx8peqvrxtzdyfr2tespy6kd92qhpeavhswcnf46urqqslxhx`](https://testnet.explorer.provable.com/transaction/at1tz3fs6t82vx8peqvrxtzdyfr2tespy6kd92qhpeavhswcnf46urqqslxhx) |

---

## Novel Contributions

1. **First Vickrey auction on Aleo** — Second-price mechanism with `second_highest_bids` mapping, on-chain and immutable. No other Aleo project has implemented this.
2. **Commit-reveal with zero transfer at bid time** — Unlike naive implementations that transfer tokens on bid (leaking amounts), Obscura defers escrow to reveal. This is correct sealed-bid architecture.
3. **Anti-sniping mechanism** — Block-height-based deadline extension (40-block window). Neither NullPay nor Veiled Markets implements this.
4. **Settlement proofs + Payment proofs** — On-chain tamper-evident hashes and cryptographic commitments for verifiable auction integrity.
5. **Selective disclosure via `prove_won_auction`** — ZK proof of winning without revealing the bid amount, enabling downstream use cases (marketplace, lending, insurance).
6. **Dual token support** — Full ALEO + USDCx paths for escrow, settlement, and refund across both first-price and Vickrey modes.
7. **Hashed seller identity** — `BHP256(address as field)` — seller address never appears in any public mapping.

---

## Deep Dives

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full contract architecture, token flows, bug fixes, competitor comparison
- **[PRIVACY.md](./PRIVACY.md)** — Privacy model, attack vector analysis, lifecycle privacy audit
- **[VICKREY_EXPLAINER.md](./VICKREY_EXPLAINER.md)** — Game theory, why ZK is required, worked numerical examples

---

## License

MIT
