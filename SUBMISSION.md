# Obscura Auction -- Buildathon Submission

## Project

**Obscura** -- Privacy-First Multi-Format Auction Protocol on Aleo

## Team

- **Builder**: Ritik Pandey
- **GitHub**: Ritik200238

## Links

| Resource | URL |
|----------|-----|
| Smart Contract v5 | [`obscura_v5.aleo`](https://testnet.explorer.provable.com/program/obscura_v5.aleo) on Aleo Testnet |
| Marketplace Contract | [`obscura_market_v1.aleo`](https://testnet.explorer.provable.com/program/obscura_market_v1.aleo) on Aleo Testnet |
| Deploy TX v5 | [`at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a`](https://testnet.explorer.provable.com/transaction/at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z5wxnuv9m09gc9suq928a) |
| Smart Contract v2 | [`obscura_v2.aleo`](https://explorer.provable.com/transaction/at1qy5h67s6629k07rf0vp2f6jxrh5xhqpxm6td2c8cmsl0s7233cgsafp7hk) (superseded) |
| Smart Contract v1 | [`obscura_auction.aleo`](https://explorer.provable.com/transaction/at1j58ds0rvhpwtspyvmr9wjxkrd2jq3xg2v25p8se4ezsv40a8xupswz58g4) (initial, superseded) |
| Frontend | [obscura-auction-95hm.vercel.app](https://obscura-auction-95hm.vercel.app) |
| Backend API | [obscura-auction.onrender.com](https://obscura-auction.onrender.com/health) |
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

### Smart Contract (31 core + 21 marketplace = 52 total transitions)
- **Commit-Reveal Sealed Bids** -- strictest privacy model for auctions
- **Vickrey (Second-Price) Auctions** -- first implementation on Aleo; winner pays 2nd-highest bid
- **Anti-Sniping** -- block-height-based deadline extensions prevent last-second manipulation
- **Triple Token Support** -- ALEO Credits (credits.aleo) + USDCx (test_usdcx_stablecoin.aleo) + USAD (test_usad_stablecoin.aleo)
- **Full Escrow** -- funds locked in program balance until settlement/refund
- **Settlement & Payment Proofs** -- BHP256 hashes for tamper-evident on-chain verification
- **Selective Disclosure** -- prove_won_auction transition proves winning without revealing bid amount
- **6 Record Types** -- SealedBid, EscrowReceipt, WinnerCertificate, SellerReceipt, DisputeBond, MarketReceipt
- **18 Mappings** -- minimal public data, hashed identities
- **Marketplace Contract** -- `obscura_market_v1.aleo` with 21 transitions for fixed-price sales, RFQ, token sales, royalties, provenance, and timelocks
- **8-State Machine** -- Active -> Revealing -> Settled/Failed/Cancelled/Expired/Disputed

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
| SealedBid | place_bid | reveal_bid variants | Proves bid commitment |
| EscrowReceipt | reveal_bid variants | claim_win* / claim_refund* | Proves deposited amount |
| WinnerCertificate | claim_win* | -- | Proof of winning |
| SellerReceipt | claim_win* | -- | Proof of payment received |
| DisputeBond | dispute_auction | resolve_dispute | Proves dispute stake |

## Token Integration

- **ALEO Credits**: Private deposit via `transfer_private_to_public`, private payout via `transfer_public_to_private`
- **USDCx Stablecoin**: Integration with `test_usdcx_stablecoin.aleo` for stablecoin-denominated auctions
- **USAD Stablecoin**: Integration with `test_usad_stablecoin.aleo` (First-Price mode)
- Bidders deposit tokens to the program's public escrow
- Winners and losers receive payouts as private records (ALEO) or public balance (USDCx/USAD)
- Sellers choose token type at auction creation — all flows work for ALEO, USDCx, and USAD

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
