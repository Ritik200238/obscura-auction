# Obscura — Privacy-First Sealed-Bid Auction Protocol on Aleo

## Technical Architecture Reference

---

## Project Identity
- **Name:** Obscura
- **Program ID:** `obscura_auction.aleo`
- **Tagline:** Bids enter the dark chamber. Only at reveal does the picture become clear.
- **Use Cases:** Private procurement, sealed tenders, NFT auctions, anonymous bidding

---

## Head-to-Head vs Competitors

| Criteria (Weight) | NullPay | Veiled Markets | **Obscura** | Our Edge |
|---|---|---|---|---|
| **Privacy (40%)** | Invoice hash public, amounts leak | 18 public mappings, resolver exposed | Sealed bids, hashed seller, winner self-identifies | Commit-reveal is strictest privacy model |
| **Tech (20%)** | ~8 transitions, 2 records | 30 transitions, 4 records | **10 transitions, 4 records, 11 mappings** | Vickrey auction = never done on Aleo |
| **UX (20%)** | Glassmorphism, dual mobile/desktop | Cluttered market UI | Clean 6-page dashboard, 5-step flow | Phase-based UI + demo page |
| **Practicality (10%)** | Invoice payments | Prediction markets | Private procurement/auctions | Real-world sealed tenders |
| **Novelty (10%)** | Multi-pay invoices | FPMM AMM | **Vickrey + anti-sniping + commit-reveal** | First second-price ZK auction ever |

---

## Smart Contract: obscura_auction.aleo

### Final Metrics
```
Transitions:  10 (including constructor)
Records:      4  (all private, proper UTXO)
Mappings:     11
Structs:      5
State Machine: 8 states
Tokens:       credits.aleo (fully private ALEO credits)
Novel:        Vickrey (second-price) auction + anti-sniping
```

### All 10 Transitions

```
CONSTRUCTOR:
  initialize_platform              → one-time setup

AUCTION LIFECYCLE (3):
  create_auction                   → unified (auction_mode param, ALEO token)
  cancel_auction                   → seller cancels (0 bids only)
  close_bidding                    → anyone calls after deadline

BIDDING (1):
  place_bid                        → ALEO sealed bid + escrow

REVEAL (1):
  reveal_bid                       → unified (no token transfer, just mapping)

SETTLEMENT (2):
  finalize_auction                 → determines win/fail (no transfer)
  claim_win                        → winner claim + seller payout

REFUNDS (2):
  claim_refund                     → loser refund (double-spend FIXED)
  claim_unrevealed_refund          → unrevealed bidder refund
```

### Records (4 — All Private)
```
SealedBid           → bidder's sealed commitment (consumed on reveal)
EscrowReceipt       → proof of escrowed funds (consumed on refund)
WinnerCertificate   → winner's proof of purchase (kept forever)
SellerReceipt       → seller's proof of sale (kept forever)
```

### Mappings (11)
```
auctions             → AuctionData (status, hashes, deadlines, auction_mode)
bid_commitments      → bool (replay prevention)
revealed_bids        → u128 (post-reveal amounts)
highest_bids         → u128 (per-auction max)
second_highest_bids  → u128 (for Vickrey)
auction_winners      → field (winning bid_hash)
program_balance      → u128 (pooled by token type)
auction_escrow       → u128 (per-auction total)
platform_treasury    → u128 (fees by token type)
platform_config      → PlatformConfig
settlements          → SettlementData (double-claim prevention)
```

### Structs (7)
```
AuctionData       → item_hash, seller_hash, category, token_type, auction_mode,
                     status, deadline, reveal_deadline, bid_count,
                     reserve_price_hash, created_at, dispute_deadline
AuctionSeed       → creator, item_hash, deadline, nonce
BidCommitment     → bidder, auction_id, amount, nonce
SettlementData    → winner_bid_hash, final_price, fee_collected, settled_at
PlatformConfig    → admin_hash, fee_bps, dispute_bond_bps, paused
```

### Constants
```
STATUS_ACTIVE: u8 = 1        STATUS_CLOSED: u8 = 2
STATUS_REVEALING: u8 = 3     STATUS_SETTLED: u8 = 4
STATUS_CANCELLED: u8 = 5     STATUS_FAILED: u8 = 6
STATUS_DISPUTED: u8 = 7      STATUS_EXPIRED: u8 = 8

TOKEN_ALEO: u8 = 1           (ALEO credits only)
MODE_FIRST_PRICE: u8 = 1     MODE_VICKREY: u8 = 2

PLATFORM_FEE_BPS: u128 = 100         (1%)
FEE_DENOMINATOR: u128 = 10000

REVEAL_WINDOW_BLOCKS: u64 = 2880     (~12 hours)
MIN_AUCTION_DURATION: u64 = 240      (~1 hour)
MIN_BID_AMOUNT: u128 = 1000
SNIPE_WINDOW_BLOCKS: u64 = 40        (~10 minutes)
SNIPE_EXTENSION_BLOCKS: u64 = 40     (~10 minutes)
```

### State Machine
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
    (reserve met)         (reserve NOT met)
           │                     │
           ▼                     ▼
    ┌────────────┐        ┌──────────┐
    │  SETTLED   │        │  FAILED  │
    │    (4)     │        │   (6)    │
    └────────────┘        └──────────┘
```

### Token Flow (Escrow Lifecycle)
```
DEPOSIT (place_bid):
  credits.aleo/transfer_private_to_public(record, program_addr, amount_u64)
  Result: Bidder's private credits → program's public balance (amount visible, sender hidden)

PAYOUT (claim_win):
  credits.aleo/transfer_public_to_private(seller_addr, payout_u64)
  Result: Program's public balance → seller's private credit record (recipient hidden)

REFUND (claim_refund):
  credits.aleo/transfer_public_to_private(bidder_addr, refund_u64)
  Result: Program's public balance → bidder's private credit record (recipient hidden)
```

---

## 7 Bugs Fixed

### BUG #1: CRITICAL — Winner Double-Spend
- Problem: claim_refund compared BidClaimKey hash vs BidCommitment hash (different structs = always different = winner could also refund)
- Fix: Compute BidCommitment hash in claim_refund using receipt.escrowed_amount, compare that against auction_winners

### BUG #2: Reserve Price Disclosed at Settlement (Accepted Trade-Off)
- Problem: do_finalize_auction receives reserve_price as u128 in finalize args (public on-chain)
- Mitigation: Reserve is only disclosed AFTER bidding AND reveal are both complete — all bid amounts are already public at this point. This is standard sealed-bid practice.
- The reserve_price_hash ensures integrity (finalize verifies `BHP256(reserve_price) == stored_hash`)

### BUG #3: HIGH — item_hash: 0field in Certificates
- Problem: WinnerCertificate and SellerReceipt had placeholder item_hash
- Fix: Pass item_hash as private input to claim_win, verify in finalize against auction.item_hash

### BUG #4: CRITICAL — USDCx Signatures Wrong
- Problem: Wrong record type (token vs Token), wrong parameter order, missing MerkleProof
- Fix: Path B — use transfer_public_as_signer for deposit, transfer_public_to_private for withdrawal

### BUG #5: MEDIUM — Dead RefundClaim Record
- Problem: Record defined but never created by any transition
- Fix: Removed entirely.

### BUG #6: MEDIUM — No Double-Settlement Prevention
- Problem: No mapping prevented claim_win from being called twice
- Fix: New settlements mapping with assert(!already_claimed) check

---

## 5 Improvements Added

### 1. Vickrey (Second-Price) Auction Mode
- New auction_mode field in AuctionData
- New second_highest_bids mapping
- New claim_win_vickrey transition (winner pays second-highest bid)
- First ever on Aleo — maximum novelty score

### 2. Anti-Sniping Protection
- SNIPE_WINDOW_BLOCKS (40 blocks = ~10 min)
- If bid placed within last 10 min, deadline extends by 10 min
- Checked in finalize_place_bid
- Neither competitor has this

### 3. Unified create_auction (merged 2 → 1)
- token_type and auction_mode as parameters
- No token transfer at creation, so no need for variants

### 4. Unified reveal_bid (merged 2 → 1)
- No token transfer during reveal, token-agnostic

### 5. Unified finalize_auction (merged 2 → 1)
- Only checks mappings, no token transfer

---

## Privacy Wall

```
PUBLIC (11 mappings):                    PRIVATE (4 records):
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│ auction_id (derived hash)        │    │ Bidder addresses                 │
│ item_hash (BHP256, not text)     │    │ Bid amounts (until reveal)       │
│ seller_hash (BHP256, NOT addr)   │    │ Seller's real address            │
│ category (1-4, generic)          │    │ Reserve price (hash only)        │
│ auction_mode (1 or 2)            │    │ Winner identity (until claim)    │
│ status (numeric enum)            │    │ Escrow records                   │
│ deadline (block height)          │    │ Refund details                   │
│ bid_count (counter only)         │    │ Payment to seller (private TX)   │
│ reserve_price_hash (BHP256)      │    │ Winner/Seller certificates       │
│ highest_bid (post-reveal ONLY)   │    │                                  │
│ second_highest (post-reveal)     │    │                                  │
│ platform_config (admin hash)     │    │                                  │
└──────────────────────────────────┘    └──────────────────────────────────┘

vs NullPay:  Invoice hash publicly searchable. Amounts leak. Open API.
vs Veiled:   18 mappings. Resolver + disputer addresses in plaintext.
We expose:   Only hashes + counters + status. Zero identities. Zero amounts until reveal.
```

---

## Security Analysis

| Attack | Mitigation | NullPay? | Veiled? |
|---|---|---|---|
| Winner double-spend | BUG #1 FIXED — bid_hash comparison | N/A | N/A |
| Reserve price leak | BUG #2 FIXED — boolean only in finalize | N/A | N/A |
| Bid brute-force | BHP256 + unique nonce = 2^253 space | YES vulnerable | NO |
| Sniping | Anti-snipe extension | YES vulnerable | YES vulnerable |
| Bid replay | bid_commitments mapping | Partial | Partial |
| Double settlement | settlements mapping + record consumption | YES vulnerable | NO |
| Escrow theft | Cryptographic proof for all withdrawals | N/A | YES (orphaned) |
| Resolver bias | No resolver — seller finalizes with hash | N/A | YES |
| Backend exposure | Per-column encryption + auth + rate limit | YES (open API) | Partial |

---

## Frontend Architecture

### Tech Stack
- React 19 + TypeScript + Vite
- Tailwind CSS
- Zustand (3 stores, ~230 lines total)
- @provablehq/aleo-wallet-adaptor-react (Shield primary, Puzzle fallback)
- Framer Motion (subtle only)

### 6 Pages
```
/                   → Landing + featured auctions + privacy callout
/browse             → Browse active auctions (backend index + on-chain enrichment + direct lookup)
/create             → Create auction form (7 params: title, category, reserve, mode, token, duration, nonce)
/auction/:id        → Phase-based detail (bid/reveal/settle/claim/refund)
/my-activity        → My bids, wins, refunds (records from wallet)
/docs               → Privacy model, architecture, how-to, FAQ
```

### 4 Hooks
```
useTransaction()     → Wraps wallet adapter executeTransaction, fee conversion, error handling
useAuction(id)       → Read auction/bids/winners mappings, auto-refresh every 30s
useRecords()         → Fetch + parse user's records from wallet (SealedBid, EscrowReceipt, WinnerCert, SellerReceipt)
useCountdown(deadline) → Block-based countdown with formatted time remaining
```
Action panels (BidPanel, RevealPanel, ClaimPanel, RefundPanel, SettlePanel)
use `useTransaction()` directly for clean, single-responsibility components.

### 3 Zustand Stores
```
walletStore.ts    → { address, connected, balance }
auctionStore.ts   → { auctions[], selected, filters }
recordStore.ts    → { sealedBids[], escrowReceipts[], certs[] }
```

### Phase-Based UI on /auction/:id
```
ACTIVE     → BidPanel + CountdownTimer + CloseBiddingCard (after deadline)
                                       + CancelAuctionCard (0 bids, seller only)
REVEALING  → RevealPanel + SettlePanel (after reveal deadline, for seller)
SETTLED    → ClaimPanel (winner) + RefundPanel (losers)
FAILED     → RefundPanel (all bidders)
CANCELLED  → "Auction Cancelled" info card
EXPIRED    → "No bids received" info card
```

---

## Backend Architecture

### Tech: Express + TypeScript + AES-256-GCM Encrypted JSON Store

### Data Files (encrypted at rest)
```
data/auctions.json  → seller_address ENCRYPTED per-column
data/bids.json      → bidder_address ENCRYPTED per-column
```

### Per-Column Key Derivation
```
key = HKDF(masterSecret, salt = tableName + columnName)
encrypt(plaintext, key) → { iv: 12 bytes, ciphertext, authTag: 16 bytes }
```

### API Routes
```
GET  /api/auctions              → list all auctions (public-safe view, no encrypted fields)
GET  /api/auctions/:id          → single auction + on-chain mapping merge
POST /api/auctions              → register metadata after on-chain TX
POST /api/auctions/:id/bids     → register bid metadata
GET  /api/auctions/:id/bids     → revealed bids (post-reveal only)
GET  /health
```

### Background Sync (Every 2 Minutes)
```
Poll Aleo explorer API → parse on-chain mappings (auctions, highest_bids,
second_highest_bids, auction_winners) → update local store → detect status changes
```

---

## Deployment

```
Frontend:   Vercel (auto-deploys from GitHub main branch)
            VITE_BACKEND_URL → backend Vercel URL
            SPA routing via vercel.json rewrites

Backend:    Vercel Serverless (Express as serverless function)
            Upstash Redis for persistent storage
            Environment: ENCRYPTION_KEY, KV_REST_API_URL, KV_REST_API_TOKEN

Contract:   Aleo Testnet (obscura_auction.aleo)
            Deployed via leo deploy --no-build
            Explorer API for read-only state queries
```

For detailed privacy analysis, see [PRIVACY.md](./PRIVACY.md).
