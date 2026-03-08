# Obscura Auction -- Buildathon Submission

## Project

**Obscura** -- Privacy-First Sealed-Bid Auction Protocol on Aleo

## Team

- **Builder**: Ritik Pandey
- **GitHub**: Ritik200238

## Links

| Resource | URL |
|----------|-----|
| Smart Contract v2 | [`obscura_v2.aleo`](https://explorer.provable.com/transaction/at1qy5h67s6629k07rf0vp2f6jxrh5xhqpxm6td2c8cmsl0s7233cgsafp7hk) on Aleo Testnet |
| Deploy TX v2 | `at1qy5h67s6629k07rf0vp2f6jxrh5xhqpxm6td2c8cmsl0s7233cgsafp7hk` |
| Initialize TX v2 | `at13tuzlf4k3wtltp47v2e7uvklh246l8s0pgnqn8ewawhtc56z2qyqc2tnfl` |
| Smart Contract v1 | [`obscura_auction.aleo`](https://explorer.provable.com/transaction/at1j58ds0rvhpwtspyvmr9wjxkrd2jq3xg2v25p8se4ezsv40a8xupswz58g4) (initial, superseded) |
| Initialize TX v1 | `at127myrsahfjvysa0ul3vxg0vt7jzut5hardpgtc8ncpeasdy5wgys4f6lla` |
| Frontend | [obscura-auction-95hm.vercel.app](https://obscura-auction-95hm.vercel.app) |
| Backend API | [obscura-auction-igia.vercel.app](https://obscura-auction-igia.vercel.app/health) |
| Repository | [github.com/Ritik200238/obscura-auction](https://github.com/Ritik200238/obscura-auction) |
| Architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Privacy Model | [PRIVACY.md](./PRIVACY.md) |

## What It Does

Obscura is a sealed-bid auction protocol where bid amounts are truly private. Bidders commit encrypted bids as Aleo private records. Only after bidding closes do participants reveal their bids. The winner self-identifies by proving ownership of the winning record. Sellers receive payment as private ALEO credits.

## Why It Matters

Traditional on-chain auctions expose all bids publicly, enabling front-running and bid manipulation. Obscura uses Aleo's programmable privacy to implement commit-reveal sealed-bid auctions where:
- Bid amounts are invisible during bidding (private SealedBid records)
- Bidder identities are never revealed to other participants
- Seller identity is hashed (BHP256) on-chain
- Payment flows through private record transfers

## Privacy Architecture

**Private (encrypted, owner-only):**
- Bidder addresses and identities
- Bid amounts (until voluntary reveal)
- Seller's real address (hashed on-chain)
- Reserve price (hash-only until settlement)
- Winner identity (until self-claim)
- All payment records (SealedBid, EscrowReceipt, WinnerCertificate, SellerReceipt)

**Public (minimal on-chain footprint):**
- auction_id (derived hash, not plaintext)
- item_hash (BHP256 of title)
- seller_hash (BHP256 of address)
- Status, deadline, bid_count
- Revealed amounts (post-reveal only)

## Technical Highlights

### Smart Contract (10 transitions)
- **Commit-Reveal Sealed Bids** -- strictest privacy model for auctions
- **Vickrey (Second-Price) Auctions** -- first implementation on Aleo; winner pays 2nd-highest bid
- **Anti-Sniping** -- bids in last 10 min extend deadline by 10 min
- **ALEO Credits** -- fully private escrow via credits.aleo
- **Full Escrow** -- funds locked in program balance until settlement/refund
- **4 Record Types** -- SealedBid, EscrowReceipt, WinnerCertificate, SellerReceipt
- **11 Mappings** -- minimal public data, hashed identities
- **8-State Machine** -- Active -> Revealing -> Settled/Failed/Cancelled/Expired

### Frontend
- React + TypeScript + Vite + Tailwind CSS
- Shield Wallet integration with delegated proving
- Phase-aware auction UI (bid/reveal/claim/refund panels adapt to auction state)
- Real-time on-chain data enrichment via Explorer API

### Backend
- Express + TypeScript API for auction discoverability
- AES-256-GCM per-column encryption for all metadata
- On-chain sync via Explorer API for trustless state
- Rate-limited, CORS-protected, Helmet-secured

## Record Model Usage

| Record | Created By | Consumed By | Purpose |
|--------|-----------|-------------|---------|
| SealedBid | place_bid | reveal_bid | Proves bid commitment |
| EscrowReceipt | place_bid | claim_refund / claim_win | Proves deposited amount |
| WinnerCertificate | claim_win | -- | Proof of winning |
| SellerReceipt | claim_win | -- | Proof of payment received |

## Token Integration

- **ALEO Credits**: Private deposit via `transfer_private_to_public`, private payout via `transfer_public_to_private`
- Bidders deposit private credits to the program's public escrow
- Winners and losers receive payouts as private credit records (no public trace of recipient)

## Demo Flow

1. Seller creates auction (title hashed to field, reserve price hashed)
2. Bidders place sealed bids (amount stored as private record, funds escrowed)
3. After deadline, anyone triggers close_bidding
4. Bidders reveal their bids (consume SealedBid record)
5. Seller finalizes (proves reserve price via hash, determines winner)
6. Winner claims certificate + seller receives payment
7. Losers claim refunds from escrow

## Novel Contributions

1. **First Vickrey auction on Aleo** -- second-price mechanism with `second_highest_bids` mapping
2. **Anti-sniping mechanism** -- block-height-based deadline extension
3. **Commit-reveal with UTXO consumption** -- SealedBid record consumed on reveal prevents double-reveal
4. **Hashed seller identity** -- seller_hash (BHP256) keeps seller address private on-chain
