# Obscura — Technical Architecture Reference

---

## Project Identity
- **Name:** Obscura
- **Program ID:** `obscura_v3.aleo`
- **Tagline:** Bids enter the dark chamber. Only at reveal does the picture become clear.
- **Use Cases:** Private procurement, sealed tenders, NFT auctions, anonymous bidding, government contracts

---

## Head-to-Head vs Competitors

| Criteria (Weight) | NullPay | Veiled Markets | **Obscura** | Our Edge |
|---|---|---|---|---|
| **Privacy (40%)** | Invoice hash public, amounts leak via API | 18 public mappings, resolver exposed | Sealed bids, hashed seller, zero-transfer bidding, winner self-identifies | Commit-reveal with no token transfer at bid = strictest privacy |
| **Tech (20%)** | ~8 transitions, 2 records, 4 mappings | 30 transitions, 4 records, 18+ mappings | **17 transitions, 4 records, 13 mappings** | Vickrey + anti-sniping + settlement proofs + payment proofs = never done on Aleo |
| **UX (20%)** | Glassmorphism, mobile via Shield browser | Cluttered market UI with AMM math | Clean 6-page dashboard, phase-based panels, 5-step flow | Phase-aware UI adapts to auction state; quick templates |
| **Practicality (10%)** | Invoice payments | Prediction markets (FPMM) | Private procurement/auctions | Real-world sealed tenders, private art sales, government contracts |
| **Novelty (10%)** | Multi-pay invoices, donation invoices | FPMM AMM, dispute mechanism | **Vickrey + anti-sniping + commit-reveal + selective disclosure** | First second-price ZK auction on any blockchain |
| **Token Integration** | credits.aleo + USDCx (public transfer) | credits.aleo + USDCx (both paths) | credits.aleo + USDCx (full escrow paths) | Private ALEO + public USDCx with Vickrey refund flows |
| **Proofs** | None | None | Settlement proofs + payment proofs (on-chain) | Tamper-evident + verifiable commitments |
| **Selective Disclosure** | None | None | `prove_won_auction` ZK transition | Winner proves ownership without revealing amount |

---

## Smart Contract: obscura_v3.aleo

### Final Metrics
```
Transitions:  17 (+ constructor = 18 total)
Records:      4  (all private, proper UTXO)
Mappings:     13
Structs:      7
State Machine: 8 states
Tokens:       credits.aleo (fully private ALEO credits) + test_usdcx_stablecoin.aleo (USDCx)
Novel:        Vickrey (second-price) + anti-sniping + settlement proofs + payment proofs + selective disclosure
```

### All 17 Transitions

```
CONSTRUCTOR:
  initialize_platform              → one-time setup (admin hash, fee %, pause)

AUCTION LIFECYCLE (3):
  create_auction                   → unified (auction_mode + token_type params)
  cancel_auction                   → seller cancels (0 bids only)
  close_bidding                    → anyone calls after deadline (→ REVEALING or EXPIRED)

BIDDING (1):
  place_bid                        → sealed bid commitment only — NO token transfer

REVEAL + ESCROW (2):
  reveal_bid                       → ALEO: reveal + escrow (consume SealedBid, create EscrowReceipt)
  reveal_bid_usdcx                 → USDCx: reveal + escrow

FINALIZATION (1):
  finalize_auction                 → determines win/fail (settlement proof stored)

SETTLEMENT — FIRST-PRICE (2):
  claim_win                        → ALEO: winner claim + seller payout (payment proof stored)
  claim_win_usdcx                  → USDCx: winner claim + seller payout

SETTLEMENT — VICKREY (2):
  claim_win_vickrey                → ALEO: winner pays 2nd price, refunded difference
  claim_win_vickrey_usdcx          → USDCx: winner pays 2nd price, refunded difference

REFUNDS (2):
  claim_refund                     → ALEO: loser refund (double-spend FIXED)
  claim_refund_usdcx               → USDCx: loser refund

ADMIN (2):
  withdraw_fees                    → ALEO: admin withdraws accumulated fees
  withdraw_fees_usdcx              → USDCx: admin withdraws accumulated fees

SELECTIVE DISCLOSURE (1):
  prove_won_auction                → ZK proof of winning (WinnerCertificate not consumed)
```

### Records (4 — All Private)
```
SealedBid           → bidder's sealed commitment (consumed on reveal)
                      Fields: owner, auction_id, bid_amount, bid_nonce, token_type

EscrowReceipt       → proof of escrowed funds (consumed on refund or claim)
                      Fields: owner, auction_id, escrowed_amount, bid_nonce, token_type

WinnerCertificate   → winner's proof of purchase (kept forever, used in prove_won_auction)
                      Fields: owner, auction_id, item_hash, winning_amount, token_type (u8), certificate_id

SellerReceipt       → seller's proof of sale (kept forever)
                      Fields: owner, auction_id, item_hash, sale_amount, fee_paid, token_type (u8)
```

### Mappings (13)
```
auctions             → AuctionData (status, hashes, deadlines, auction_mode, token_type)
bid_commitments      → bool (replay prevention — stores BHP256 commitment hashes)
revealed_bids        → u128 (post-reveal amounts, keyed by bid_hash)
highest_bids         → u128 (per-auction max revealed bid)
second_highest_bids  → u128 (for Vickrey — second-highest revealed bid)
auction_winners      → field (winning bid_hash — NOT winner's address)
program_balance      → u128 (pooled by token type: 0u8=ALEO, 1u8=USDCx)
auction_escrow       → u128 (per-auction total escrowed)
platform_treasury    → u128 (accumulated fees by token type)
settlements          → SettlementData (double-claim prevention)
platform_config      → PlatformConfig (admin hash, fee_bps, pause state)
settlement_proofs    → field (BHP256 hash of SettlementProof — tamper-evident)
payment_proofs       → field (BHP256 commit of payment amount — verifiable)
```

### Structs (7)
```
AuctionData       → item_hash, seller_hash, category, token_type, auction_mode,
                     status, deadline, reveal_deadline, bid_count,
                     reserve_price_hash, created_at, dispute_deadline

AuctionSeed       → creator, item_hash, deadline, nonce
                     (hashed to derive deterministic auction_id)

BidCommitment     → bidder, auction_id, amount, nonce
                     (hashed for commitment, verified at reveal)

SettlementData    → winner_bid_hash, final_price, fee_collected, settled_at

SettlementProof   → auction_id, highest_bid, second_highest, winner_bid_hash, settled_at
                     (hashed and stored in settlement_proofs mapping)

PaymentCommitData → auction_id, bid_amount, winner_bid_hash
                     (used as documentation struct — actual commit uses BHP256::commit_to_field)

PlatformConfig    → admin_hash, fee_bps, dispute_bond_bps, paused
```

### Constants
```
STATUS_ACTIVE: u8 = 1        STATUS_CLOSED: u8 = 2
STATUS_REVEALING: u8 = 3     STATUS_SETTLED: u8 = 4
STATUS_CANCELLED: u8 = 5     STATUS_FAILED: u8 = 6
STATUS_DISPUTED: u8 = 7      STATUS_EXPIRED: u8 = 8

TOKEN_ALEO: u8 = 1           TOKEN_USDCX: u8 = 2
MODE_FIRST_PRICE: u8 = 1     MODE_VICKREY: u8 = 2

PLATFORM_FEE_BPS: u128 = 100         (1%)
FEE_DENOMINATOR: u128 = 10000

REVEAL_WINDOW_BLOCKS: u64 = 2880     (~12 hours)
MIN_AUCTION_DURATION: u64 = 240      (~1 hour)
MIN_BID_AMOUNT: u128 = 1000          (0.001 ALEO / 0.001 USDCx)
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
    (reserve met)         (reserve NOT met
           │               OR Vickrey < 2 reveals)
           ▼                     │
    ┌────────────┐        ┌──────────┐
    │  SETTLED   │        │  FAILED  │
    │    (4)     │        │   (6)    │
    └─────┬──────┘        └──────────┘
          │
    ┌─────┴──────────────────────┐
    │                            │
    │  FIRST-PRICE:              │  VICKREY:
    │  claim_win / claim_win_u   │  claim_win_vickrey / _usdcx
    │  (seller gets bid - fee)   │  (seller gets 2nd_price - fee,
    │                            │   winner refunded difference)
    │                            │
    │  claim_refund (losers)     │  claim_refund (losers)
    └────────────────────────────┘
```

### Token Flow (Escrow Lifecycle)

#### ALEO Credits Path
```
DEPOSIT (reveal_bid — NOT place_bid):
  credits.aleo/transfer_private_to_public(record, program_addr, amount_u64)
  Result: Bidder's private credits → program's public balance

PAYOUT — FIRST-PRICE (claim_win):
  credits.aleo/transfer_public_to_private(seller_addr, payout_u64)
  Result: Program's public balance → seller's private credit record (recipient hidden)

PAYOUT — VICKREY (claim_win_vickrey):
  credits.aleo/transfer_public_to_private(seller_addr, second_price_minus_fee)
  credits.aleo/transfer_public_to_private(winner_addr, escrowed_minus_second_price)
  Result: Seller gets 2nd price - fee as private credits; winner gets refund as private credits

REFUND (claim_refund):
  credits.aleo/transfer_public_to_private(bidder_addr, refund_u64)
  Result: Program's public balance → bidder's private credit record

FEE WITHDRAWAL (withdraw_fees):
  credits.aleo/transfer_public_to_private(admin_addr, amount_u64)
  Result: Treasury → admin's private credit record
```

#### USDCx Path
```
DEPOSIT (reveal_bid_usdcx):
  test_usdcx_stablecoin.aleo/transfer_public_as_signer(program_addr, amount_u128)
  Result: Bidder's public USDCx → program's public balance

PAYOUT (claim_win_usdcx / claim_win_vickrey_usdcx):
  test_usdcx_stablecoin.aleo/transfer_public(recipient, amount_u128)
  Result: Program's public balance → recipient's public balance

REFUND (claim_refund_usdcx):
  test_usdcx_stablecoin.aleo/transfer_public(bidder, amount_u128)
  Result: Program's public balance → bidder's public balance

FEE WITHDRAWAL (withdraw_fees_usdcx):
  test_usdcx_stablecoin.aleo/transfer_public(admin, amount_u128)
  Result: Treasury → admin's public balance
```

### Vickrey Payout Flow (Second-Price)

```
Example: Bidder A bids 100 ALEO, Bidder B bids 80 ALEO. Vickrey mode.

During bidding:
  place_bid(100 ALEO) → SealedBid record (amount hidden)
  place_bid(80 ALEO)  → SealedBid record (amount hidden)

During reveal:
  reveal_bid(A) → 100 ALEO escrowed, highest_bids = 100, second_highest_bids = 0
  reveal_bid(B) → 80 ALEO escrowed, second_highest_bids = 80

finalize_auction:
  reserve met + >= 2 revealed bids → STATUS_SETTLED
  settlement_proof stored on-chain

claim_win_vickrey (called by A):
  fee = 80 × 1% = 0.8 ALEO (fee is on SALE PRICE, not escrowed amount)
  seller_payout = 80 - 0.8 = 79.2 ALEO (private credits)
  winner_change = 100 - 80 = 20 ALEO (private credits refund)
  platform_treasury += 0.8 ALEO

  Total: seller gets 79.2, winner gets 20 back, platform gets 0.8
  Winner effectively paid 80 ALEO for item worth (to them) 100 ALEO
  Surplus captured by winner: 20 ALEO (incentive to bid true value)
```

---

## Bugs Fixed (7 Total)

### BUG #1: CRITICAL — Winner Double-Spend
- **Problem**: `claim_refund` compared BidClaimKey hash vs BidCommitment hash (different structs = always different = winner could also refund)
- **Fix**: Compute BidCommitment hash in `claim_refund` using receipt fields, compare against `auction_winners`

### BUG #2: Reserve Price Disclosed at Settlement (Accepted Trade-Off)
- **Problem**: `finalize_auction` receives `reserve_price` as finalize argument (visible)
- **Mitigation**: Reserve disclosed only AFTER all bids revealed — no longer strategically valuable. Hash verification ensures seller cannot lie.

### BUG #3: HIGH — item_hash: 0field in Certificates
- **Problem**: WinnerCertificate and SellerReceipt had placeholder item_hash
- **Fix**: Pass item_hash as private input to `claim_win`, verify in finalize against `auction.item_hash`

### BUG #4: CRITICAL — USDCx Signatures Wrong
- **Problem**: Wrong record type, wrong parameter order for USDCx calls
- **Fix**: Use `transfer_public_as_signer` for deposit, `transfer_public` for withdrawal

### BUG #5: MEDIUM — Dead RefundClaim Record
- **Problem**: Record defined but never created by any transition
- **Fix**: Removed entirely

### BUG #6: MEDIUM — No Double-Settlement Prevention
- **Problem**: No mapping prevented `claim_win` from being called twice
- **Fix**: `settlements` mapping with `assert(!already_claimed)` check

### BUG #7: MEDIUM — No claim_unrevealed_refund needed
- **Problem**: In old design where tokens transferred at bid time, unrevealed bidders needed a refund path
- **Fix**: New architecture defers escrow to reveal — unrevealed bidders hold a worthless SealedBid (no tokens locked). No refund transition needed.

---

## Improvements Added (8 Total)

### 1. Vickrey (Second-Price) Auction Mode
- `auction_mode` field in AuctionData (1=first-price, 2=Vickrey)
- `second_highest_bids` mapping — updated atomically in `finalize_reveal_bid`
- `claim_win_vickrey` / `claim_win_vickrey_usdcx` — winner pays 2nd price, refunded difference
- First ever on Aleo

### 2. Anti-Sniping Protection
- SNIPE_WINDOW_BLOCKS (40 blocks = ~10 min)
- If bid placed within final window, deadline extends by 40 blocks
- Checked in `finalize_place_bid`

### 3. USDCx Dual-Token Support
- `reveal_bid_usdcx`, `claim_win_usdcx`, `claim_win_vickrey_usdcx`, `claim_refund_usdcx`, `withdraw_fees_usdcx`
- Full escrow lifecycle for both ALEO (private) and USDCx (public)

### 4. Settlement Proofs
- `settlement_proofs` mapping stores `BHP256(SettlementProof{...})` after finalize
- Tamper-evident — retroactive manipulation invalidates the hash
- Publicly verifiable by any third party

### 5. Payment Proofs
- `payment_proofs` mapping stores `BHP256::commit_to_field(amount, nonce_scalar)` after claim_win
- Uses hiding+binding commitment — observer cannot determine amount without nonce
- Winner can selectively disclose by sharing their nonce

### 6. Selective Disclosure (prove_won_auction)
- ZK proof that the caller holds a valid WinnerCertificate for a given auction_id
- Reveals nothing about bid amount or other certificate fields
- Certificate is returned (not consumed) — can be used repeatedly

### 7. Fee Withdrawal (withdraw_fees / withdraw_fees_usdcx)
- Platform admin can withdraw accumulated fees from `platform_treasury`
- Admin identity verified via `BHP256(caller) == stored admin_hash`

### 8. Zero-Transfer Bidding
- Deferred escrow architecture: `place_bid` stores only a commitment hash, no token transfer
- Tokens locked at `reveal_bid` when amounts are intentionally public
- Eliminates the privacy leak of credits.aleo transfers during sealed phase

---

## Privacy Wall

```
PUBLIC (13 mappings):                    PRIVATE (4 records):
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│ auction_id (derived hash)        │    │ Bidder addresses                 │
│ item_hash (BHP256, not text)     │    │ Bid amounts (until reveal)       │
│ seller_hash (BHP256, NOT addr)   │    │ Seller's real address            │
│ category (1-4, generic)          │    │ Reserve price (hash only)        │
│ auction_mode (1 or 2)            │    │ Winner identity (until claim)    │
│ token_type (1 or 2)              │    │ Escrow records                   │
│ status (numeric enum)            │    │ Refund details                   │
│ deadline (block height)          │    │ Payment to seller (private TX)   │
│ bid_count (counter only)         │    │ Winner/Seller certificates       │
│ reserve_price_hash (BHP256)      │    │ Item title/description           │
│ highest_bid (post-reveal ONLY)   │    │                                  │
│ second_highest (post-reveal)     │    │                                  │
│ platform_config (admin hash)     │    │                                  │
│ settlement_proofs (tamper hash)  │    │                                  │
│ payment_proofs (commit hash)     │    │                                  │
└──────────────────────────────────┘    └──────────────────────────────────┘

vs NullPay:  Invoice hash publicly searchable. Amounts leak via public API.
vs Veiled:   18+ mappings. Resolver + disputer addresses in plaintext.
We expose:   Only hashes + counters + status. Zero identities. Zero amounts until reveal.
```

---

## Security Analysis

| Attack | Mitigation | NullPay? | Veiled? |
|---|---|---|---|
| Winner double-spend | BUG #1 FIXED — BidCommitment hash comparison in claim_refund | N/A | N/A |
| Reserve price leak | Hash-only on-chain; boolean verified at finalize | N/A | N/A |
| Bid brute-force | BHP256 + unique nonce = 2^253 search space | YES vulnerable | NO |
| Sniping | Anti-snipe extension (40-block window) | YES vulnerable | YES vulnerable |
| Bid replay | bid_commitments mapping | Partial | Partial |
| Double settlement | settlements mapping + record consumption | YES vulnerable | NO |
| Escrow theft | Cryptographic proof for all withdrawals | N/A | YES (orphaned funds) |
| Resolver bias | No resolver — seller finalizes with hash proof | N/A | YES |
| Backend exposure | AES-256-GCM per-column encryption + rate limit | YES (open API) | Partial |
| Settlement tampering | settlement_proofs hash — any party can verify | N/A | N/A |
| Payment disputes | payment_proofs commitment — verifiable with nonce | N/A | N/A |

---

## Frontend Architecture

### Tech Stack
- React 19 + TypeScript + Vite
- Tailwind CSS
- Zustand (3 stores)
- @provablehq/aleo-wallet-adaptor-react (Shield Wallet primary)
- Framer Motion (subtle animations)

### 6 Pages
```
/                   → Landing + hero + features + privacy wall + demo instructions
/browse             → Browse auctions (backend index + on-chain enrichment + direct lookup)
/create             → Create auction form (templates, params, privacy notice)
/auction/:id        → Phase-based detail (bid/reveal/settle/claim/refund panels)
/my-activity        → My records: sealed bids, escrow receipts, certificates (wallet records)
/docs               → Privacy model, architecture, how-to, FAQ (10 questions)
```

### 4 Custom Hooks
```
useTransaction()     → Wraps wallet adapter executeTransaction, fee conversion, error handling
useAuction(id)       → Read auction/bids/winners mappings, auto-refresh every 30s
useRecords()         → Fetch + parse user's records from wallet (SealedBid, EscrowReceipt, etc.)
useCountdown(deadline) → Block-based countdown with formatted time remaining
```

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
                                       + Anti-snipe indicator (if bids placed)
REVEALING  → RevealPanel + SettlePanel (after reveal deadline, for seller)
SETTLED    → ClaimPanel (winner) + RefundPanel (losers) + Proof of Fair Auction card
FAILED     → RefundPanel (all bidders)
CANCELLED  → "Auction Cancelled" info card
EXPIRED    → "No bids received" info card
```

---

## Backend Architecture

### Tech: Express + TypeScript + AES-256-GCM Encrypted Storage

### API Routes
```
GET  /health                    → Health check + block height
GET  /api/auctions              → List all auctions (public-safe view, no encrypted fields)
GET  /api/auctions/:id          → Single auction + on-chain mapping merge
POST /api/auctions              → Register metadata after on-chain TX
POST /api/auctions/:id/bids     → Register bid metadata
GET  /api/auctions/:id/bids     → Revealed bids (post-reveal only)
GET  /api/my/auctions?address=X → User's created auctions
GET  /api/my/bids?address=X     → User's placed bids
```

### Per-Column Encryption
```
key = HKDF(masterSecret, salt = tableName + columnName)
encrypt(plaintext, key) → { iv: 12 bytes, ciphertext, authTag: 16 bytes }
Encrypted fields: seller_address, bidder_address
```

---

## Deployment

```
Frontend:   Vercel (auto-deploys from GitHub main branch)
            Root directory: frontend
            Install: npm install --legacy-peer-deps
            SPA routing via vercel.json rewrites

Backend:    Vercel Serverless (Express as serverless function)
            Upstash Redis for persistent storage
            Environment: ENCRYPTION_KEY, KV_REST_API_URL, KV_REST_API_TOKEN

Contract:   Aleo Testnet (obscura_v3.aleo)
            Deployed via snarkos developer deploy
            Explorer API for read-only state queries
```

For detailed privacy analysis, see [PRIVACY.md](./PRIVACY.md).
