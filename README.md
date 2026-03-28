# Obscura — The Private Auction Protocol

> Every auction on Ethereum is a fishbowl. Bids are public. Bidders are doxxed. Front-runners extract value before the gavel falls. **Obscura makes auctions invisible.**

**[Try the Live Demo](https://obscura-auction-95hm.vercel.app)** · **[Core Contract](https://testnet.explorer.provable.com/program/obscura_v5.aleo)** · **[Marketplace Contract](https://testnet.explorer.provable.com/program/obscura_market_v1.aleo)** · Shield Wallet Required

---

## The Problem

On public blockchains, auctions are broken:

- **Bidders see each other's bids** — strategic underbidding kills fair price discovery
- **MEV bots front-run** — extracting value from every transaction in the mempool
- **Seller identity is exposed** — competitors know who's selling what, and when
- **Winners are doxxed** — everyone knows who paid what for which asset

This isn't a theoretical concern. It happens on every Ethereum NFT auction, every on-chain liquidation, every DAO treasury sale. The result: sellers get less, bidders overpay or game the system, and privacy is nonexistent.

## The Solution

Obscura is a sealed-bid auction protocol built on Aleo's zero-knowledge architecture. **Bid amounts are cryptographically invisible during bidding.** Bidder identities never touch the chain. Winners self-identify by proving ownership of a private record — without revealing what they paid.

**What makes it different from "just encrypting bids":**

During Obscura's sealed phase, **no tokens move at all**. An observer watching `credits.aleo` transfers learns absolutely nothing — no amounts, no timing correlations, no sender addresses. This is the fundamental privacy innovation: *zero-transfer sealed bidding*.

---

## What You Can Do on Obscura

### Four Auction Formats
| Format | How It Works | Best For |
|--------|-------------|----------|
| **Sealed-Bid** | Bids are encrypted. Highest bid wins. | Standard private sales |
| **Vickrey (2nd-Price)** | Highest bid wins, but pays the *second-highest* price. Truthful bidding is the dominant strategy. | High-value assets where fair pricing matters |
| **Dutch (Descending)** | Price drops over time. First buyer wins instantly. | Liquidations, time-sensitive sales |
| **English (Ascending)** | Open ascending bids with anti-sniping protection. | Collectibles, competitive bidding |

### Three Token Types
ALEO Credits (maximum privacy — private record transfers), USDCx stablecoin, USAD stablecoin. Every auction format works with every token.

### Marketplace Extensions
Fixed-price sales ("Buy Now"), RFQ/reverse auctions (buyers post requests, sellers compete), and token sales (batch distribution) — deployed as a companion contract `obscura_market_v1.aleo`.

---

## Privacy Model — What's Hidden, What's Not

| Data | During Bidding | After Reveal | After Settlement |
|------|---------------|-------------|-----------------|
| **Bid amounts** | Invisible (no tokens move) | Visible (intentional) | Visible |
| **Bidder identity** | Never stored on-chain | Never stored | Never stored |
| **Seller identity** | BHP256 hash only | Hash only | Hash only |
| **Reserve price** | BHP256 hash only | Hash only | Revealed by seller |
| **Winner identity** | N/A | N/A | Self-disclosed via claim |
| **Payment amounts** | N/A | N/A | Private ALEO records |

**The key insight:** Privacy degrades gracefully and intentionally. Bid amounts are invisible when it matters (during competition), then become visible when the bidder *chooses* to reveal. Seller and bidder identities are *never* on-chain in plaintext — only as irreversible BHP256 hashes.

### Privacy Comparison: Obscura vs Public Chains

The frontend includes a **"See on Ethereum" toggle** on every auction detail page. Switch it on to see what the same auction would look like on a public blockchain — exposed addresses, visible bid amounts, MEV bot warnings. Switch back to see what Obscura protects. This isn't a gimmick; it's the clearest way to understand why privacy matters for auctions.

### Privacy Score

Every auction card displays an **A+ through F privacy grade** based on format, token type, and settlement state. Vickrey auctions with ALEO tokens score A+ (maximum privacy). English auctions with stablecoins score lower (bid amounts are public by design, stablecoin transfers expose addresses). This helps users make informed decisions about their privacy exposure.

### Real-Time Privacy Monitor

On each auction detail page, a **three-column privacy visualization** shows in real-time:
- **"Network sees"** — raw hashes, bid counts, status codes (monospace, dim)
- **"You see"** — item name, bid amounts, time remaining (bright, readable)
- **"Hidden from everyone"** — individual amounts, identities, nonces (lock icons, redacted bars)

When a new bid arrives, the network column shows a new hash appearing. The user column shows "New sealed bid received." The hidden column stays locked. This makes the privacy model tangible, not abstract.

---

## Contract Architecture

Two programs deployed on Aleo Testnet:

### `obscura_v5.aleo` — Core Auction Protocol
28 transitions, 16 mappings, 5 private records, 53 KB compiled.

| Group | What It Does |
|-------|-------------|
| **Platform** (3) | Initialize, emergency pause, fee withdrawal |
| **Auction Lifecycle** (4) | Create (sealed/Vickrey/English/Dutch), cancel, close bidding |
| **Sealed Bidding** (1) | Encrypted bid commitment — zero token transfer |
| **Reveal + Escrow** (3) | Prove commitment + lock tokens atomically (ALEO/USDCx/USAD) |
| **Settlement** (2) | Determine winner for sealed-bid and English formats |
| **Claims** (8) | Winner settlement, Vickrey refunds, loser refunds — all 3 tokens |
| **Dutch** (2) | Instant buy at descending price |
| **English** (2) | Ascending bids with 5% minimum increment + anti-sniping |
| **Dispute** (2) | Bond-based challenge (10% of highest bid) + admin resolution |
| **ZK Proof** (1) | `prove_won_auction` — prove you won without revealing what you paid |

### `obscura_market_v1.aleo` — Marketplace Extensions
21 transitions for:
- **Fixed-Price Sales** — list, buy (3 tokens), delist
- **RFQ (Request for Quote)** — buyers post, sellers submit private quotes, buyer accepts
- **Token Sales** — batch distribution with multiple participants
- **Royalties** — creator royalty enforcement on secondary sales
- **Provenance** — on-chain ownership history chain
- **Timelocks** — time-delayed escrow for conditional sales

**Total platform: 49 transitions across 2 programs.**

### Private Records (UTXO Model)

| Record | Purpose | Lifetime |
|--------|---------|----------|
| **SealedBid** | Encrypted bid commitment (amount + nonce) | Created at bid, consumed at reveal |
| **EscrowReceipt** | Proof of locked tokens | Created at reveal, consumed at claim/refund |
| **WinnerCertificate** | Permanent proof of winning | Never consumed — used in `prove_won_auction` |
| **SellerReceipt** | Permanent proof of sale with fee breakdown | Never consumed |
| **DisputeBond** | Dispute stake receipt | Created at dispute, consumed at resolution |

### State Machine

```
Sealed-Bid / Vickrey:
  ACTIVE → REVEALING → SETTLED → (optional) DISPUTED → SETTLED or FAILED
  ACTIVE → CANCELLED (0 bids) | EXPIRED (deadline, 0 bids)

Dutch: ACTIVE → SETTLED (instant on first buy) | EXPIRED

English: ACTIVE → SETTLED (after deadline) | FAILED (no bids)
```

Anti-sniping: bids in the last 40 blocks (~10 min) extend the deadline by 40 blocks. Prevents last-second front-running in English and sealed-bid formats.

---

## How to Use It

### Prerequisites
- **[Shield Wallet](https://shieldwallet.io/)** browser extension (set to Testnet mode)
- Testnet ALEO from the **[faucet](https://faucet.provable.com)** (also accessible on every page of the app)

### As a Seller
1. Connect Shield Wallet → **Create** page → pick a template (NFT, DAO sale, service, collectible) or start from scratch
2. Choose format (Sealed-Bid, Vickrey, Dutch, English), token type, reserve price, duration
3. Submit — progress bar shows ZK proof generation (~30-45s) → get your auction ID
4. Share the ID with bidders. After deadline, settle the auction on the detail page.
5. Receive payment as a private `SellerReceipt` record.

### As a Bidder
1. **Browse** page → find an auction → enter bid amount
2. `place_bid` creates a private `SealedBid` record. **No tokens move.** Nobody can see your bid.
3. After bidding closes → **Reveal** your bid (tokens escrowed atomically)
4. Win → claim your `WinnerCertificate`. In Vickrey mode, pay only the second-highest price.
5. Lose → claim full refund from escrow.

### Dutch Auction
Watch the price drop. Click "Buy Now" when it hits your target. Instant settlement, no waiting.

### English Auction
Place ascending bids (5% minimum increment). Anti-sniping extends the deadline if you bid in the last ~10 minutes. Highest bidder at deadline wins.

---

## Interactive Learning

The app includes an **interactive Vickrey auction explainer** at `/learn` — a 4-step tutorial with game theory, numerical examples, and a playable bidding simulator. Place your bid against AI opponents and see how second-price auctions incentivize truthful bidding. This isn't just documentation; it's a tool for understanding why privacy + Vickrey is a powerful combination.

---

## Security

| Protection | How |
|-----------|-----|
| **Zero-transfer sealed phase** | No tokens move at bid time. Observer learns nothing from `credits.aleo`. |
| **Commit-reveal integrity** | `BHP256(BidCommitment)` stored at bid, recomputed and verified at reveal. |
| **Anti-sniping** | 40-block deadline extension prevents last-second manipulation. |
| **Double-settlement guard** | `settlements` mapping prevents claiming twice. |
| **Bid replay prevention** | `bid_commitments` mapping with unique nonce per bid. |
| **Settlement proofs** | Tamper-evident `BHP256(SettlementProof)` hash stored on-chain. |
| **Payment proofs** | `BHP256::commit_to_field(amount, nonce)` — verifiable without revealing nonce. |
| **Dispute bonds** | 10% of highest bid. Forfeited if frivolous. 100-block grace period for sellers. |
| **UTXO record consumption** | SealedBid and EscrowReceipt consumed on use. No double-reveal, no double-refund. |
| **Hashed identities** | Seller, disputer addresses stored as BHP256 hashes. Computationally irreversible. |

---

## On-Chain Proof

| Field | Value |
|-------|-------|
| Core Program | [`obscura_v5.aleo`](https://testnet.explorer.provable.com/program/obscura_v5.aleo) |
| Marketplace | [`obscura_market_v1.aleo`](https://testnet.explorer.provable.com/program/obscura_market_v1.aleo) |
| Network | Aleo Testnet |
| Dependencies | `credits.aleo`, `test_usdcx_stablecoin.aleo`, `test_usad_stablecoin.aleo` |

### Verified Transactions

| Action | TX ID | Format |
|--------|-------|--------|
| Deploy | [`at1f3sxn...q928a`](https://testnet.explorer.provable.com/transaction/at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a) | Platform |
| Initialize | [`at1ugfzn...myfu`](https://testnet.explorer.provable.com/transaction/at1ugfznxv9dufgatesere2gkstvph492f3ykd6sj4ajdjqazmgvgrs97myfu) | Platform |
| Create Auction | [`at14fpq6...qu2`](https://testnet.explorer.provable.com/transaction/at14fpq6yazt7cye9pmhhuk6vgtem8zcxezc5p5yczndhmy43v0mv9qdn8qu2) | Sealed-Bid |
| Place Bid | [`at1nkl2w...rxk`](https://testnet.explorer.provable.com/transaction/at1nkl2w4jsztcqfqhue7ua5tmkksaze686xqmtkg0rd0g8jznwxqrqj8prxk) | Sealed-Bid |
| Close Bidding | [`at1enwth...ym5`](https://testnet.explorer.provable.com/transaction/at1enwthmddswqajfkctjpuwdzy7924fm6s2yqnxrydf3d97xs745qseg5ym5) | Sealed-Bid |
| Reveal Bid | [`at1tz3fs...xhx`](https://testnet.explorer.provable.com/transaction/at1tz3fs6t82vx8peqvrxtzdyfr2tespy6kd92qhpeavhswcnf46urqqslxhx) | Sealed-Bid |

---

## What's Novel

1. **First Vickrey (second-price) auction on Aleo** — game-theoretically optimal: truthful bidding is the dominant strategy when bids are private
2. **Zero-transfer sealed bidding** — no tokens move at bid time, eliminating the privacy leak every other sealed-bid implementation has
3. **Four auction formats in one contract** — no other Aleo program supports Sealed-Bid, Vickrey, Dutch, and English
4. **Selective winner disclosure** — `prove_won_auction` lets winners prove they won without revealing what they paid
5. **Anti-sniping on-chain** — 40-block deadline extension. Neither NullPay nor Veiled Markets implements this
6. **Companion marketplace architecture** — two-program design (`obscura_v5` + `obscura_market_v1`) shows platform thinking, not demo thinking
7. **Privacy-first UX** — privacy score grades, Ethereum comparison toggle, real-time privacy monitor — privacy isn't just in the contract, it's in the user experience

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contract** | Leo (Aleo) — 2 programs, 49 transitions |
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS + Framer Motion + Zustand |
| **Backend** | Express + TypeScript + AES-256-GCM encryption + Supabase |
| **Wallet** | Shield Wallet (delegated proving) via `@provablehq/aleo-wallet-adaptor-react` |
| **Deployment** | Vercel (frontend) + Render (backend) + Aleo Testnet (contracts) |

---

## Quick Start

```bash
git clone https://github.com/Ritik200238/obscura-auction.git
cd obscura-auction

# Frontend
cd frontend && npm install --legacy-peer-deps && cp .env.example .env && npm run dev

# Backend (separate terminal)
cd backend && npm install && cp .env.example .env && npm run dev

# Build contracts
cd contracts/obscura_v4 && leo build
cd ../obscura_market && leo build
```

---

## Deep Dives

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full contract architecture, token flows, state machine, competitor comparison
- **[PRIVACY.md](./PRIVACY.md)** — Privacy model, attack surface analysis, lifecycle privacy audit
- **[VICKREY_EXPLAINER.md](./VICKREY_EXPLAINER.md)** — Game theory analysis, why ZK + Vickrey is powerful, worked numerical examples

---

Built by **Ritik Pandey** for the Aleo Privacy Buildathon. MIT License.
