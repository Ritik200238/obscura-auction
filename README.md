# Obscura — Private Multi-Format Auction Protocol on Aleo

**[Live Demo](https://obscura-auction-95hm.vercel.app)** | **[Contract on Explorer](https://testnet.explorer.provable.com/program/obscura_v4.aleo)** | **Shield Wallet Required**

---

## What is Obscura?

Obscura is a sealed-bid auction protocol on Aleo where bid amounts are cryptographically invisible during bidding, bidder identities never touch the chain, and winners self-identify by proving ownership of a private record. Four auction formats (Sealed-Bid, Vickrey, Dutch, English), three token types (ALEO, USDCx, USAD), commit-reveal with zero-transfer sealed phase, on-chain dispute resolution, and selective winner disclosure — all in a single 2,752-line Leo contract deployed as `obscura_v4.aleo`.

---

## Wave 4 Updates

- **Dutch auction mode** — descending price, first buyer wins instantly, no reveal phase
- **English auction mode** — ascending open bids with anti-sniping (40-block deadline extension)
- **USAD stablecoin support** — third token alongside ALEO Credits and USDCx
- **Dispute resolution** — bond-based challenge mechanism (10% of highest bid, admin resolution)
- **Auction Intelligence page** — live on-chain analytics with phase timelines and format distribution
- **In-app technical docs** — 8-section documentation with Leo code, state machines, SDK examples
- **TypeScript SDK** — `@obscura/sdk` for programmatic auction creation, bidding, and on-chain reads
- **Auction monitor bot** — automated on-chain state polling and auction tracking
- **ZK Social Proof** — "Share Your Win" surfaces `prove_won_auction` for selective disclosure
- **Mode-aware UI** — every page adapts to the auction format: timelines, bid panels, privacy notices
- **Privacy messaging** — contextual notices on every interaction explaining what's private and why
- **Auction templates** — pre-configured setups for NFT drops, DAO sales, services, rare items
- **Fixed scroll visibility** — landing page sections now trigger reliably on normal scroll speed
- **Wave 4 update modal** — first-visit changelog so the judge sees what changed immediately

---

## Privacy Model

| Data | Status | Mechanism |
|------|--------|-----------|
| Bid amounts (sealed phase) | **Private** | Zero-transfer at bid time. No tokens move. BHP256 commitment only. |
| Bidder identity | **Private** — never stored | Address used only in off-chain ZK circuit scope. Not in any mapping. |
| Reserve price | **Private** — hash only | `BHP256(reserve_price)` stored on-chain. Seller re-proves at finalize. |
| Seller address | **Private** — hash only | `BHP256(address as field)` — computationally infeasible to reverse. |
| Winner identity | **Private** — self-disclosed | Winner calls `claim_win` to reveal themselves. `prove_won_auction` for selective disclosure. |
| Payment records | **Private** — UTXO | ALEO payouts via `transfer_public_to_private` create encrypted credit records. |
| Bid amounts (after reveal) | **Public** — intentional | That's what "reveal" means. Amounts become public when bidders choose to reveal. |
| Item details | **Private** — off-chain | Title/description stored AES-256-GCM encrypted in backend, never on-chain. |

**Design choice**: No tokens move during `place_bid`. An observer watching `credits.aleo` transfers learns nothing about bid amounts during the sealed phase. Escrow happens at `reveal_bid`, when disclosure is intentional.

---

## Contract Stats

```
Program:       obscura_v4.aleo
Lines:         2,752 Leo
Transitions:   28 (27 async + 1 pure off-chain)
Records:       5 (SealedBid, EscrowReceipt, WinnerCertificate, SellerReceipt, DisputeBond)
Mappings:      16
Structs:       9
State Machine: 8 states (Active, Closed, Revealing, Settled, Cancelled, Failed, Disputed, Expired)
Tokens:        credits.aleo + test_usdcx_stablecoin.aleo + test_usad_stablecoin.aleo
Formats:       First-Price Sealed-Bid, Vickrey (2nd-Price), Dutch (Descending), English (Ascending)
```

### All 28 Transitions (Grouped)

| Group | Transitions | Count | Purpose |
|-------|------------|-------|---------|
| **Platform** | `initialize_platform`, `admin_emergency`, `withdraw_fees` | 3 | Setup, emergency pause, fee collection |
| **Auction Lifecycle** | `create_auction`, `create_dutch_auction`, `cancel_auction`, `close_bidding` | 4 | Create (sealed/Vickrey/English + Dutch), cancel, close |
| **Sealed Bidding** | `place_bid` | 1 | Encrypted bid commitment — no token transfer |
| **Reveal + Escrow** | `reveal_bid`, `reveal_bid_usdcx`, `reveal_bid_usad` | 3 | Reveal commitment + lock tokens atomically |
| **Settlement** | `finalize_auction`, `settle_english` | 2 | Determine winner for sealed-bid and English formats |
| **Claim (1st-Price)** | `claim_win`, `claim_win_usdcx`, `claim_win_usad` | 3 | Winner + seller settlement |
| **Claim (Vickrey)** | `claim_win_vickrey`, `claim_win_vickrey_usdcx` | 2 | Second-price settlement + refund difference |
| **Refunds** | `claim_refund`, `claim_refund_usdcx`, `claim_refund_usad` | 3 | Losers reclaim escrowed tokens |
| **Dutch** | `bid_dutch`, `bid_dutch_usdcx` | 2 | Instant buy at current descending price |
| **English** | `bid_english`, `bid_english_usdcx` | 2 | Ascending bid with 5% minimum increment |
| **Dispute** | `dispute_auction`, `resolve_dispute` | 2 | Bond-based challenge + admin resolution |
| **ZK Proof** | `prove_won_auction` | 1 | Selective disclosure — prove you won without revealing bid amount |

Of these 28, 11 are token-variant transitions (same logic, different token path). The remaining 17 are unique logic: auction lifecycle, bidding, settlement, dispute resolution, and selective disclosure.

### Records (5 — All Private UTXO)

| Record | Created By | Contains | Consumed By |
|--------|-----------|----------|-------------|
| `SealedBid` | `place_bid` | auction_id, bid_amount, bid_nonce, token_type | `reveal_bid` variants |
| `EscrowReceipt` | `reveal_bid` variants | auction_id, escrowed_amount, bid_nonce, token_type | `claim_win*` / `claim_refund*` |
| `WinnerCertificate` | `claim_win*` | auction_id, item_hash, winning_amount, token_type, certificate_id | Never consumed (proof of winning) |
| `SellerReceipt` | `claim_win*` | auction_id, item_hash, sale_amount, fee_paid, token_type | Never consumed (proof of sale) |
| `DisputeBond` | `dispute_auction` | auction_id, bond_amount | `resolve_dispute` |

### State Machine

```
Sealed-Bid / Vickrey:
  ACTIVE → (close_bidding) → REVEALING → (finalize_auction) → SETTLED or FAILED
  ACTIVE → (cancel_auction, 0 bids) → CANCELLED
  ACTIVE → (close_bidding, 0 bids) → EXPIRED
  SETTLED → (dispute_auction) → DISPUTED → (resolve_dispute) → SETTLED or FAILED

Dutch:
  ACTIVE → (bid_dutch) → SETTLED (instant, first buyer wins)
  ACTIVE → (deadline passes) → EXPIRED

English:
  ACTIVE → (settle_english, after deadline) → SETTLED
  ACTIVE → (no bids at deadline) → FAILED
```

Anti-sniping: Bids in the last 40 blocks (~10 min) extend the deadline by 40 blocks. Applies to sealed-bid, Vickrey, and English formats.

---

## Architecture

```
                    Shield Wallet (delegated proving)
                              │
                    ┌─────────┴─────────┐
                    │   React Frontend   │
                    │   (Vercel)         │
                    └────┬─────────┬────┘
                         │         │
              ┌──────────┘         └──────────┐
              │                               │
    ┌─────────┴─────────┐          ┌──────────┴──────────┐
    │  Express Backend   │          │   Aleo Testnet       │
    │  (Render)          │          │   obscura_v4.aleo    │
    │                    │          │                      │
    │  AES-256-GCM       │          │  28 transitions      │
    │  encrypted metadata│   ◄──────│  16 mappings         │
    │  Upstash Redis     │  sync    │  5 private records   │
    └────────────────────┘          │                      │
                                    │  credits.aleo        │
                                    │  test_usdcx_stab...  │
                                    │  test_usad_stab...   │
                                    └──────────────────────┘
```

**Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, Framer Motion. 9 pages, mode-aware auction detail with phase-based panels.

**Backend**: Express + TypeScript. AES-256-GCM per-column encryption for seller/bidder addresses. Upstash Redis for persistence. On-chain sync via Explorer API.

**Wallet**: Shield Wallet with delegated proving via `@provablehq/aleo-wallet-adaptor-react`.

**SDK**: `@obscura/sdk` — TypeScript client for programmatic auction interaction. Prepare transactions, read on-chain state, calculate Dutch prices.

---

## Token Support

| Token | Deposit (Escrow) | Payout | Privacy |
|-------|-----------------|--------|---------|
| **ALEO** | `credits.aleo/transfer_private_to_public` | `credits.aleo/transfer_public_to_private` | Full — private records in, private records out |
| **USDCx** | `test_usdcx_stablecoin.aleo/transfer_public_as_signer` | `test_usdcx_stablecoin.aleo/transfer_public` | Public balance transfers |
| **USAD** | `test_usad_stablecoin.aleo/transfer_public_as_signer` | `test_usad_stablecoin.aleo/transfer_public` | Public balance transfers |

---

## Demo Instructions

### Prerequisites
- [Shield Wallet](https://shieldwallet.io/) browser extension (switch to Testnet)
- Aleo testnet credits from the [faucet](https://faucet.aleo.org) (or use the faucet button on every page)

### Sealed-Bid / Vickrey Auction (Seller)

1. Connect Shield Wallet at [obscura-auction-95hm.vercel.app](https://obscura-auction-95hm.vercel.app)
2. Go to `/create`. Pick a template or start from scratch. Set auction mode (First-Price or Vickrey), token, reserve price, duration.
3. Submit. Shield Wallet prompts for signature. Progress bar shows ZK proof generation (~30-45s).
4. Copy auction ID from the confirmation. Share with bidders.
5. After deadline: anyone clicks "Close Bidding" on the auction page.
6. After reveal deadline: go to the auction page, re-enter your exact reserve price in the Settle panel. Contract verifies `BHP256(input) == stored_hash`.
7. Winner calls `claim_win` (or `claim_win_vickrey`). You receive a `SellerReceipt` + payment.

### Sealed-Bid / Vickrey Auction (Bidder)

1. Go to `/browse` or enter an auction ID directly.
2. On the auction page, enter bid amount. `place_bid` creates a private `SealedBid` record. **No tokens transfer.**
3. After bidding closes (REVEALING phase): click "Reveal Bid". Tokens are escrowed atomically.
4. If you win: Claim panel appears. Click "Claim Win". You get a `WinnerCertificate`. In Vickrey mode, you pay the second-highest bid and get the difference refunded.
5. If you lose: Click "Claim Refund" to reclaim escrowed tokens.

### Dutch Auction (Buyer)

1. Browse Dutch auctions or go to `/auction/{id}`.
2. Watch the price drop in real-time (linear decay from start to floor price).
3. Click "Buy Now" when the price hits your target. Settlement is instant — no reveal, no waiting.

### English Auction (Bidder)

1. Browse English auctions.
2. Place ascending bids (minimum 5% above current highest).
3. Anti-sniping: bids in the last ~10 minutes extend the deadline.
4. After deadline, anyone clicks "Settle". Highest bidder wins.

---

## On-Chain Proof

### Deployed Contract

| Field | Value |
|-------|-------|
| Program ID | `obscura_v4.aleo` |
| Network | Aleo Testnet |
| Deploy TX | [`at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a`](https://testnet.explorer.provable.com/transaction/at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a) |
| Initialize TX | [`at1ugfznxv9dufgatesere2gkstvph492f3ykd6sj4ajdjqazmgvgrs97myfu`](https://testnet.explorer.provable.com/transaction/at1ugfznxv9dufgatesere2gkstvph492f3ykd6sj4ajdjqazmgvgrs97myfu) |
| Platform Config | fee_bps=100 (1%), dispute_bond_bps=500 (5%), paused=false |
| Dependencies | `credits.aleo`, `test_usdcx_stablecoin.aleo`, `test_usad_stablecoin.aleo` |

### Verified Transactions

<!-- TODO: Replace with Wave 4 demo TX IDs before submission -->

| Action | TX ID | Format |
|--------|-------|--------|
| Create Auction | [`at14fpq6yazt7cye9pmhhuk6vgtem8zcxezc5p5yczndhmy43v0mv9qdn8qu2`](https://testnet.explorer.provable.com/transaction/at14fpq6yazt7cye9pmhhuk6vgtem8zcxezc5p5yczndhmy43v0mv9qdn8qu2) | Sealed-Bid |
| Place Bid | [`at1nkl2w4jsztcqfqhue7ua5tmkksaze686xqmtkg0rd0g8jznwxqrqj8prxk`](https://testnet.explorer.provable.com/transaction/at1nkl2w4jsztcqfqhue7ua5tmkksaze686xqmtkg0rd0g8jznwxqrqj8prxk) | Sealed-Bid |
| Close Bidding | [`at1enwthmddswqajfkctjpuwdzy7924fm6s2yqnxrydf3d97xs745qseg5ym5`](https://testnet.explorer.provable.com/transaction/at1enwthmddswqajfkctjpuwdzy7924fm6s2yqnxrydf3d97xs745qseg5ym5) | Sealed-Bid |
| Reveal Bid | [`at1tz3fs6t82vx8peqvrxtzdyfr2tespy6kd92qhpeavhswcnf46urqqslxhx`](https://testnet.explorer.provable.com/transaction/at1tz3fs6t82vx8peqvrxtzdyfr2tespy6kd92qhpeavhswcnf46urqqslxhx) | Sealed-Bid |

Add your Wave 4 demo TX IDs here before submission: finalize, claim_win, Dutch bid, English bid, settle_english, dispute.

---

## Security

| Feature | Mechanism |
|---------|-----------|
| Anti-sniping | 40-block window. Late bids extend deadline. |
| Commit-reveal integrity | `BHP256(BidCommitment)` stored at bid, verified at reveal. |
| Double-settlement guard | `settlements` mapping + `assert(!already_settled)`. |
| Winner double-spend block | `claim_refund` checks `bid_hash != auction_winners[id]`. |
| Bid replay prevention | `bid_commitments` mapping + unique nonce per bid. |
| Settlement proofs | `BHP256(SettlementProof{...})` — tamper-evident. |
| Payment proofs | `BHP256::commit_to_field(amount, nonce)` — verifiable without revealing nonce. |
| Selective disclosure | `prove_won_auction` — ZK proof of WinnerCertificate ownership. |
| Reserve hash verification | `BHP256(reserve_price) == stored_hash` checked at finalize. |
| UTXO record consumption | SealedBid and EscrowReceipt consumed on use. No double-reveal, no double-refund. |
| Dispute bonds | 10% of highest bid. Forfeited if dispute rejected. Prevents frivolous challenges. |

---

## Novel Contributions

1. **First Vickrey auction on Aleo** — second-price mechanism with `second_highest_bids` mapping, on-chain and immutable.
2. **Zero-transfer sealed bidding** — tokens don't move at bid time. Eliminates the privacy leak of `credits.aleo` transfers during sealed phase.
3. **Four auction formats in one contract** — Sealed-Bid, Vickrey, Dutch, English. No other Aleo project supports all four.
4. **Selective disclosure** — `prove_won_auction` lets winners prove they won without revealing what they paid. Useful for procurement, provenance, lending.
5. **Anti-sniping** — block-height deadline extension. Neither NullPay nor Veiled Markets implements this.
6. **Settlement + payment proofs** — tamper-evident hashes and cryptographic commitments for verifiable auction integrity.
7. **Dispute resolution** — bond-based on-chain challenge mechanism. Post-settlement appeals without trusting the auctioneer.
8. **Triple token escrow** — full ALEO + USDCx + USAD paths for every auction phase.
9. **Hashed seller identity** — `BHP256(address as field)` — seller address never appears in any public mapping.

---

## Quick Start

```bash
# Clone
git clone https://github.com/Ritik200238/obscura-auction.git
cd obscura-auction

# Frontend
cd frontend
npm install --legacy-peer-deps
cp .env.example .env
npm run dev
# http://localhost:5173

# Backend (separate terminal)
cd backend
npm install
cp .env.example .env   # Set ENCRYPTION_KEY, KV_REST_API_URL, KV_REST_API_TOKEN
npm run dev
# http://localhost:3001

# Build contract
cd contracts/obscura_v4
leo build --network testnet --endpoint https://api.explorer.provable.com/v1
```

---

## Deep Dives

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full contract architecture, token flows, state machine, competitor comparison
- **[PRIVACY.md](./PRIVACY.md)** — Privacy model, attack vectors, lifecycle privacy audit
- **[VICKREY_EXPLAINER.md](./VICKREY_EXPLAINER.md)** — Game theory analysis, why ZK is required, worked numerical examples

---

## License

MIT
