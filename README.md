# Obscura — Private Auction Infrastructure for Aleo

> Bids are invisible. Identities never touch the chain. Winners prove ownership without revealing what they paid. **The auction protocol that treats privacy as architecture, not a feature.**

**[Live Demo](https://obscura-auction-95hm.vercel.app)** · **[Core Contract](https://testnet.explorer.provable.com/program/obscura_core_v2.aleo)** · **[Settlement](https://testnet.explorer.provable.com/program/obscura_settle_v2.aleo)** · **[Marketplace](https://testnet.explorer.provable.com/program/obscura_market_v2.aleo)** · Shield Wallet Required

---

## Why This Exists

On Ethereum, every auction is a fishbowl. Bid amounts are public. Bidders are doxxed. MEV bots front-run before the gavel falls. Sellers get less, bidders game the system, and privacy doesn't exist.

Obscura fixes this at the protocol level. During our sealed phase, **zero tokens move** — an observer watching the entire Aleo network learns nothing about bid amounts, bidder identities, or participation. This isn't encryption bolted onto a public auction. It's a ground-up ZK architecture where privacy is the default.

---

## 10 Auction Formats

| Format | Mechanism | Real-World Use |
|--------|-----------|---------------|
| **Sealed-Bid** | Encrypted bids, highest wins | NFT drops, private sales |
| **Vickrey (2nd-Price)** | Highest bid wins, pays second-highest. Truthful bidding is the dominant strategy. | Spectrum auctions, ad bidding — used by Google Ads and the US Treasury |
| **Dutch (Descending)** | Price drops per block. First buyer wins instantly. | Token launches, liquidations, flower markets |
| **English (Ascending)** | Open ascending bids with 40-block anti-sniping | Collectibles, charity, competitive bidding |
| **Bundle (Combinatorial)** | Bid on packages of 2-4 items. Subset bidding supported — bid on any combination. Seller picks revenue-maximizing allocation. | Portfolio sales, ad slot packages, NFT collections |
| **Multi-Unit (Batch)** | N identical units. Bidders specify quantity + price. Highest bidders allocated first. | Token sales, ticket sales, bond issuance |
| **Candle** | Like English, but ends at a random block. Bidders never know which block counts. Eliminates sniping entirely. | Domain auctions, parachain slot auctions |
| **Reverse** | Buyer posts a request. Sellers bid DOWN. Lowest bid wins. | Government procurement, freelance hiring, service contracts |
| **Blind Dutch** | Price drops but nobody sees it. Submit sealed bids guessing the current price. Novel privacy mechanism. | Private token sales where price shouldn't be visible |
| **Timed Escalation** | Price auto-increments every 10 minutes. Bid above current price to lead. Clock expires, last bidder wins. | Charity auctions, fundraisers, community sales |

Every format supports **ALEO Credits, USDCx, and USAD** stablecoins. Full escrow lifecycle for each.

---

## Privacy Model

### What's Private at Each Phase

| Phase | What's Hidden | What's Public | Why |
|-------|--------------|---------------|-----|
| **Bidding** | Bid amounts, bidder identities, participation | Auction exists, deadline, format | Zero tokens move. BHP256 commitments only. |
| **Reveal** | Bidder identities, payment routing | Revealed amounts (intentional) | Bidders choose to reveal. This is the purpose of the reveal phase. |
| **Settlement** | Winner identity, payment details | Winning price, settlement proof hash | Winner self-identifies via `claim_win`. Seller receives private ALEO records. |
| **Post-Settlement** | All identities, payment paths | Settlement proof (tamper-evident hash) | `prove_won_auction` enables selective disclosure without exposing any details. |

### Privacy Techniques

- **Zero-transfer sealed bidding** — no tokens move during bid phase. Observer learns nothing from `credits.aleo`.
- **Per-auction pseudonymous IDs** — seller hash is unique per auction (`BHP256(address + auction_id)`). Cannot correlate sellers across auctions.
- **Nullifier anti-replay** — bid nonces hashed into nullifiers. Prevents replay attacks without exposing bid content.
- **16-level Merkle allowlists** — gate auction access to 65,536 addresses. Proof verified in ZK circuit, never touches finalize.
- **Selective disclosure** — `prove_won_auction` lets winners prove they won specific auctions without revealing what they paid. Useful for lending collateral, provenance, procurement compliance.
- **Proof-of-participation** — non-transferable private record proving you bid on an auction, without revealing your bid amount.
- **Time-delayed result disclosure** — winning price stays hidden for a configurable block window after settlement.

### Honest Privacy Limitations

Token transfers via `credits.aleo/transfer_private_to_public` inherently expose the transfer amount on Aleo's ledger. This is an Aleo platform constraint — every project that escrows tokens has it. We minimize exposure by deferring all token movement to the reveal phase. During sealed bidding, zero tokens move.

For stablecoin paths (USDCx/USAD), `transfer_public_as_signer` exposes both sender and amount. This is the stablecoin compliance model on Aleo. The ALEO Credits path provides maximum privacy via private record transfers.

---

## Architecture

4 deployed programs with cross-program invocation (CPI):

```
obscura_core_v2.aleo          ← Auction lifecycle, bidding, 10 formats
    ↑                            29 transitions | 5 records | 23 mappings
    │ imports
obscura_settle_v2.aleo        ← ALEO token settlement
    10 transitions | 4 records | 14 mappings

obscura_settle_stable_v2.aleo ← USDCx + USAD settlement
    13 transitions | 3 records | 12 mappings

obscura_market_v2.aleo        ← Fixed sales, RFQ, token sales
    15 transitions | 3 records | 10 mappings
```

**67 transitions** across 4 programs. **15 private records.** **59 on-chain mappings.**

The settle programs import core's `SealedBid` record type via CPI — consuming the bid record proves it was created by the core program. This is cryptographic proof of valid bid participation without any trust assumption.

### Why 4 Programs

Aleo enforces a 2.1M variable limit per program. Rather than compromise on features, we split by concern:
- **Core** handles all auction logic (no token imports, pure ZK state machine)
- **Settle** handles ALEO token movement (credits.aleo CPI)
- **Settle Stable** handles stablecoin movement (USDCx + USAD CPI)
- **Market** handles marketplace extensions independently

Each program has its own mappings, records, and finalize blocks. The frontend coordinates calls across all 4.

---

## Security

| Protection | Mechanism |
|-----------|-----------|
| Zero-transfer sealed phase | No tokens move at bid time |
| BHP256 commit-reveal | Commitment stored at bid, verified at reveal |
| Anti-sniping | 40-block deadline extension |
| Double-settlement guard | `settlements` mapping |
| Bid replay prevention | `bid_commitments` + `bid_nullifiers` |
| Settlement proofs | Tamper-evident BHP256 hashes on-chain |
| Dispute bonds | 10% of highest bid, 100-block grace |
| UTXO consumption | Records consumed on use — no double-spend |
| Pseudonymous identities | Per-auction BHP256 hashes, unlinkable across auctions |

---

## On-Chain Deployment

| Program | Explorer Link |
|---------|--------------|
| `obscura_core_v2.aleo` | [View on Explorer](https://testnet.explorer.provable.com/program/obscura_core_v2.aleo) |
| `obscura_settle_v2.aleo` | [View on Explorer](https://testnet.explorer.provable.com/program/obscura_settle_v2.aleo) |
| `obscura_settle_stable_v2.aleo` | [View on Explorer](https://testnet.explorer.provable.com/program/obscura_settle_stable_v2.aleo) |
| `obscura_market_v2.aleo` | [View on Explorer](https://testnet.explorer.provable.com/program/obscura_market_v2.aleo) |

All programs deployed on Aleo Testnet with `@noupgrade` constructors.

---

## How to Use

### Prerequisites
- [Shield Wallet](https://shieldwallet.io/) (Testnet mode)
- Testnet ALEO from the [faucet](https://faucet.provable.com) — also accessible on every page

### Seller Flow
1. Connect wallet → Create page → choose format and template
2. Set reserve price, token, duration → submit
3. After deadline → settle on the auction detail page
4. Receive payment as private records

### Bidder Flow
1. Browse → find auction → place sealed bid (**no tokens move**)
2. After bidding closes → reveal bid (tokens escrowed)
3. Win → claim `WinnerCertificate` + payment settled
4. Lose → claim full refund

### Prove You Won (Without Revealing Price)
After winning, call `prove_won_auction` to generate a ZK proof. Share it with a lender, marketplace, or compliance officer. They learn you won auction X — nothing about what you paid, who you beat, or your wallet address.

---

## What's Novel

1. **First Vickrey auction on Aleo** — second-price mechanism where truthful bidding is the dominant strategy. Used by Google Ads, US Treasury, FCC spectrum auctions.
2. **Zero-transfer sealed bidding** — no tokens move during bid phase. Eliminates the privacy leak every other implementation has.
3. **Combinatorial subset bidding** — bidders specify item combinations via bitmask. Seller picks revenue-maximizing allocation. Contract enforces no-overlap and reserve constraints. First on any blockchain with ZK privacy.
4. **Candle auctions** — random end time eliminates sniping entirely. Used in parachain slot auctions and historical procurement.
5. **Blind Dutch** — descending price + sealed bids. A novel mechanism invented for this protocol.
6. **Selective winner disclosure** — `prove_won_auction` generates a ZK proof of winning. No competitor has this for auctions.
7. **10 auction formats** in a unified protocol — from simple sealed-bid to combinatorial procurement. Each with privacy tailored to the format.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contracts** | Leo 4.0.0 — 4 programs, 67 transitions, CPI architecture |
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS + Framer Motion + Zustand |
| **Backend** | Express + TypeScript + AES-256-GCM per-column encryption + Supabase |
| **Wallet** | Shield Wallet (delegated proving) |
| **SDK** | `@obscura/sdk` — TypeScript client for programmatic auction interaction |
| **Deployment** | Vercel (frontend) + Render (backend) + Aleo Testnet |

---

## Quick Start

```bash
git clone https://github.com/Ritik200238/obscura-auction.git
cd obscura-auction

# Frontend
cd frontend && npm install --legacy-peer-deps && npm run dev

# Backend
cd backend && npm install && npm run dev

# Build contracts
cd contracts/obscura_core && leo build
```

---

## Deep Dives

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Contract architecture, token flows, CPI design
- **[PRIVACY.md](./PRIVACY.md)** — Privacy model, attack surface, per-transition audit
- **[VICKREY_EXPLAINER.md](./VICKREY_EXPLAINER.md)** — Game theory, why ZK + Vickrey is powerful

---

MIT License
