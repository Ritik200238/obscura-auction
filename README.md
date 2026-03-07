# Obscura -- Privacy-First Sealed-Bid Auction Protocol on Aleo

> Bids enter the dark chamber. Only at reveal does the picture become clear.

**Obscura** is a sealed-bid auction protocol on Aleo where bid amounts are truly private. Bidders commit encrypted bids as Aleo private records. Only after bidding closes do participants reveal. The winner self-identifies by proving ownership of the winning record. Sellers receive payment as private ALEO credits — zero public trace.

| | |
|---|---|
| **Live Frontend** | [obscura-auction-95hm.vercel.app](https://obscura-auction-95hm.vercel.app) |
| **Backend API** | [obscura-auction-igia.vercel.app](https://obscura-auction-igia.vercel.app/health) |
| **Contract** | [`obscura_auction.aleo`](https://explorer.provable.com/transaction/at1j58ds0rvhpwtspyvmr9wjxkrd2jq3xg2v25p8se4ezsv40a8xupswz58g4) on Aleo Testnet |
| **Deep Dives** | [ARCHITECTURE.md](./ARCHITECTURE.md) &#124; [PRIVACY.md](./PRIVACY.md) |

---

## Privacy Wall

Every auction platform claims "privacy." Obscura delivers it at the protocol level.

```
 PRIVATE (encrypted records)           PUBLIC (on-chain mappings)
 ══════════════════════════════         ══════════════════════════════
 ● Bid amounts (until reveal)          ○ auction_id (derived hash)
 ● Bidder addresses / identities       ○ item_hash (BHP256)
 ● Seller's real address               ○ seller_hash (BHP256, NOT addr)
 ● Reserve price (hash until settle)   ○ status, deadline, bid_count
 ● Winner identity (until claim)       ○ Revealed amounts (post-reveal)
 ● All payment records (UTXO)          ○ platform_config (admin hash)
```

**vs competitors:** NullPay leaks invoice hashes and amounts via public API. Veiled Markets stores 18 public mappings including resolver addresses in plaintext. Obscura exposes only hashes, counters, and status — zero identities, zero amounts until reveal.

---

## Key Features

- **Commit-Reveal Sealed Bids** — Bid amounts are private SealedBid records, invisible to everyone until reveal
- **Vickrey (Second-Price Tracking) Auctions** — Tracks second-highest bid on-chain, requires 2+ revealed bids (first implementation on Aleo)
- **Anti-Sniping Protection** — Bids in last ~10 min extend deadline by ~10 min (40-block window)
- **ALEO Credits Integration** — Fully private escrow via `credits.aleo` (deposit private→public, payout public→private)
- **4 Private Record Types** — SealedBid, EscrowReceipt, WinnerCertificate, SellerReceipt (proper UTXO lifecycle)
- **8-State Machine** — Active → Revealing → Settled/Failed/Cancelled/Expired
- **Encrypted Backend** — AES-256-GCM per-column encryption for all off-chain metadata

---

## Architecture

### Smart Contract: `obscura_auction.aleo`

```
Transitions:    10 (including constructor)
Records:         4 (all private, proper UTXO consumption)
Mappings:       11 (minimal public exposure)
Structs:         5
State Machine:   8 states
Token:          credits.aleo (fully private ALEO credits)
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

### All 10 Transitions

| Transition | Purpose | Records | Privacy Note |
|---|---|---|---|
| `initialize_platform` | One-time setup | — | Admin hash stored, not address |
| `create_auction` | Create auction (any mode) | — | Seller address hashed via BHP256 |
| `cancel_auction` | Cancel (0 bids only) | — | — |
| `close_bidding` | Transition to reveal phase | — | — |
| `place_bid` | Submit sealed bid + escrow | Creates SealedBid + EscrowReceipt | Bid amount encrypted in record |
| `reveal_bid` | Reveal committed bid | Consumes SealedBid | Amount becomes public |
| `finalize_auction` | Determine winner | — | Reserve price verified via hash |
| `claim_win` | Winner claims + seller paid | Consumes EscrowReceipt, creates WinnerCertificate + SellerReceipt | Winner self-identifies |
| `claim_refund` | Loser reclaims escrow | Consumes EscrowReceipt | Private credits returned |
| `claim_unrevealed_refund` | Unrevealed bid refund | Consumes SealedBid + EscrowReceipt | No reveal needed |

### Record Lifecycle (UTXO Model)

```
place_bid
  ├─► SealedBid (private)         ──► consumed by reveal_bid OR claim_unrevealed_refund
  └─► EscrowReceipt (private)     ──► consumed by claim_refund OR claim_win

claim_win
  ├─► WinnerCertificate (private) ──► kept by winner (proof of ownership)
  └─► SellerReceipt (private)     ──► kept by seller (proof of payment)
```

### Token Flow (Escrow)

```
DEPOSIT (place_bid):
  credits.aleo/transfer_private_to_public(record, program_addr, amount)
  → Bidder's private credits → program's public balance

PAYOUT (claim_win):
  credits.aleo/transfer_public_to_private(seller_addr, payout)
  → Program's public balance → seller's private credit record

REFUND (claim_refund):
  credits.aleo/transfer_public_to_private(bidder_addr, refund)
  → Program's public balance → bidder's private credit record
```

---

## Frontend

- **React 19 + TypeScript + Vite + Tailwind CSS**
- **Shield Wallet** integration (primary wallet, delegated proving)
- **Phase-aware UI** — panels adapt to auction state (bid/reveal/settle/claim/refund)
- **Real-time on-chain data** via Explorer API enrichment
- **Transaction status polling** — submit → pending → confirmed/failed
- **6 Pages**: Landing, Browse, Create, Auction Detail, My Activity, Docs

### Phase-Based UI

```
ACTIVE     → BidPanel + CountdownTimer + CloseBiddingCard (after deadline)
REVEALING  → RevealPanel + SettlePanel (after reveal deadline)
SETTLED    → ClaimPanel (winner) + RefundPanel (losers)
FAILED     → RefundPanel (all bidders)
```

### Custom Hooks

```
useTransaction()       → Wallet TX execution + status polling (pending/confirmed/failed)
useAuction(id)         → Read auction mappings (auto-refresh every 30s)
useRecords()           → Fetch + parse records from wallet (SealedBid, EscrowReceipt, etc.)
useCountdown(deadline) → Block-based countdown with urgency states
```

---

## Backend

- **Express + TypeScript** API server
- **AES-256-GCM per-column encryption** for all metadata (seller_address, bidder_address)
- **HKDF key derivation** — unique key per table + column combination
- **Explorer API sync** — background sync every 2 minutes for on-chain state
- **Rate-limited, CORS-protected, Helmet-secured**

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + block height |
| GET | `/api/auctions` | List all auctions (public-safe view) |
| GET | `/api/auctions/:id` | Single auction + on-chain data merge |
| POST | `/api/auctions` | Register auction metadata |
| POST | `/api/auctions/:id/bids` | Register a bid |
| GET | `/api/auctions/:id/bids` | Revealed bids (post-reveal only) |
| GET | `/api/my/auctions?address=X` | User's created auctions |
| GET | `/api/my/bids?address=X` | User's placed bids |

---

## How to Run

### Prerequisites
- Node.js 18+
- Shield Wallet browser extension
- Aleo testnet credits (get from faucet)

### Smart Contract
```bash
cd contracts/obscura_auction
leo build --network testnet --endpoint https://api.explorer.provable.com/v1
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### Backend
```bash
cd backend
npm install
npm run dev
# API at http://localhost:3001
```

---

## Demo Guide

### As a Seller
1. Connect Shield Wallet
2. Navigate to `/create` — set item title, category, reserve price, auction mode (First-Price or Vickrey), and duration
3. Submit transaction — your auction is created on-chain
4. Wait for bids → close bidding after deadline → wait for reveals
5. Finalize auction (re-enter reserve price to prove via hash verification)
6. Winner claims → you receive a SellerReceipt with payment as private ALEO credits

### As a Bidder
1. Connect Shield Wallet
2. Browse auctions at `/browse` or look up by on-chain ID
3. Place a sealed bid — your amount is encrypted in a SealedBid record, funds escrowed on-chain
4. After bidding closes → reveal your bid (consume SealedBid record)
5. **If you win**: claim your WinnerCertificate and pay the seller (1% platform fee deducted)
6. **If you lose**: claim refund from escrow. If you forgot to reveal, use Claim Unrevealed Refund

---

## Security

| Attack Vector | Mitigation |
|---|---|
| Winner double-spend | BidCommitment hash comparison blocks winner from claiming refund |
| Reserve price leak | Only hash stored on-chain; boolean comparison in finalize (post-reveal) |
| Bid brute-force | BHP256 + unique random nonce = 2^253 search space |
| Sniping | Anti-snipe: 40-block window extends deadline |
| Bid replay | `bid_commitments` mapping prevents duplicate bid hashes |
| Double settlement | `settlements` mapping + record consumption |
| Escrow theft | Cryptographic proof required for all withdrawals |
| Backend exposure | AES-256-GCM per-column encryption + rate limiting + CORS |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Contract | Leo (Aleo's ZK language) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand |
| Backend | Express, TypeScript, AES-256-GCM |
| Wallet | Shield Wallet (primary) |
| Network | Aleo Testnet |

---

## Novel Contributions

1. **First Vickrey auction on Aleo** — second-price mechanism with `second_highest_bids` mapping
2. **Anti-sniping mechanism** — block-height-based deadline extension (neither competitor has this)
3. **Commit-reveal with UTXO consumption** — SealedBid record consumed on reveal prevents double-reveal
4. **Hashed seller identity** — seller_hash (BHP256) keeps seller address private on-chain

---

## License

MIT
