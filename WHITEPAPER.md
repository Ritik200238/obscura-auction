# Obscura

## A Multi-Format Privacy-Preserving Auction Protocol on Aleo

**Version 1.0 — April 2026**
**Aleo Privacy Buildathon Wave 5 Submission**

---

## Abstract

Obscura is a general-purpose auction infrastructure protocol that supports ten distinct auction formats — **Sealed-Bid (First-Price), Vickrey (Second-Price), Dutch, English, Bundle (Combinatorial Subset), Multi-Unit, Candle, Reverse, Blind Dutch, and Timed Escalation** — while preserving the strongest privacy guarantees currently achievable within Aleo's programmable-privacy model.

The protocol is deployed across four on-chain programs: `obscura_core_v4.aleo` (auction lifecycle, 31 transitions), `obscura_settle_v6.aleo` (ALEO settlement with commit-based permanent state), `obscura_settle_stable_v4.aleo` (USDCx/USAD settlement), and `obscura_market_v2.aleo` (fixed sales and RFQs).

Obscura introduces three novel on-chain primitives: **commit-based settlements** (the `settlements` mapping stores `BHP256(price, fee, nonce, block)` rather than plaintext amounts), **BidderParticipationProof** records (non-transferable "I participated" receipts), and **AuctionCompletionProof** records (portable seller reputation attestations). Combined with selective-disclosure ZK proofs (`prove_won_auction`) and combinatorial subset bidding with bitmask allocation, Obscura defines a protocol floor of *observer-learns-nothing-material-beyond-an-auction-exists* during the sealed phase, and *observer-learns-only-hash-commitments* at permanent state.

---

## 1. Introduction

### 1.1 Motivation

Traditional blockchain auctions leak information at every layer. Bid amounts are written to public mappings in plaintext. Bidder addresses appear in transfer events. Front-running bots monitor mempools. Settlement records preserve winning prices indefinitely. The result: every serious auction use case — NFT drops, token launches, procurement, private liquidations — suffers from MEV extraction, strategic revelation, and deanonymization.

Aleo's programmable-privacy runtime offers the primitives to fix this: off-chain execution with ZK proofs, private records, hash commitments, and selective finalize scope. But *using* these primitives correctly is non-trivial. Naive implementations either (a) expose bid amounts at escrow time via public token transfers, or (b) write plaintext running-max values to finalize mappings that persist forever.

Obscura implements, for the first time in auctions on Aleo:

- **Zero-transfer sealed bidding** — tokens do not move during bid; escrow is deferred until reveal.
- **Hash-commitment permanent state** — settled prices are stored only as BHP256 commitments; plaintext is never written to any settlement mapping.
- **Post-settlement cleanup** — running-max mappings (`highest_bids`, `second_highest_bids`) are deleted via `Mapping::remove` after claim. Public state reverts to just a settlement hash.
- **Combinatorial subset bidding** — bidders submit `item_mask: u8` bitmasks privately; a ZK circuit enforces no-overlap at allocation time.

### 1.2 Contributions

1. A multi-format auction protocol covering ten distinct mechanism-design variants in a single deployed system.
2. A commit-based settlement model that eliminates permanent plaintext price leakage.
3. Two new private-record primitives — `BidderParticipationProof` and `AuctionCompletionProof` — that provide privacy-preserving reputation portability without on-chain counters.
4. A live ecosystem: TypeScript SDK (`obscura-aleo-sdk`), CLI (`obscura-aleo-cli`), and MCP server (`obscura-aleo-mcp`) making Obscura the first Aleo auction protocol with native AI-agent integration.

---

## 2. Threat Model

### 2.1 Adversaries

We consider three adversary classes:

- **Passive observer.** Reads all on-chain state and transaction metadata. Does not participate.
- **Honest-but-curious participant.** Creates or bids on auctions honestly; inspects all publicly readable state to deanonymize others.
- **Malicious seller / bidder.** Deviates from protocol; attempts double-settlement, false reserve claims, replay attacks.

### 2.2 Non-goals

- Defense against Aleo platform-level attacks (validator collusion, snarkVM zero-day).
- Hiding of inherently-public data mandated by the auction mechanism itself (Dutch price-decay schedule, English ascending bids).
- Hiding of `credits.aleo` transfer amounts (Aleo platform constraint — universal across all projects that escrow real tokens).
- Hiding of USDCx/USAD transfer participants (stablecoin compliance model on Aleo).

### 2.3 Security Goals

1. **Bid confidentiality.** Observer does not learn any bid amount during the sealed phase.
2. **Bidder anonymity.** Observer cannot link bids to bidder addresses at any phase.
3. **Seller pseudonymity.** Observer cannot correlate auctions run by the same seller without the seller's consent.
4. **Permanent-state minimization.** No plaintext amount is written to any mapping that persists beyond settlement.
5. **Replay resistance.** A bid commitment cannot be reused across auctions.
6. **Double-settlement resistance.** A settled auction cannot be settled again.
7. **Settlement integrity.** Third parties can verify a claimed settlement occurred without being able to recompute the price from public state alone.

---

## 3. Protocol Specification

### 3.1 Architecture Overview

```
obscura_core_v4.aleo         — auction lifecycle, 10 formats, Merkle gating
    ↑ imports (via SealedBid record type)
obscura_settle_v6.aleo       — ALEO settlement, commit-based permanent state
obscura_settle_stable_v4.aleo — USDCx + USAD settlement
obscura_market_v2.aleo       — fixed sales, RFQs, token sales
```

Each program is independently deployed. Cross-program invocation (CPI) uses `SealedBid` as the shared record type: the settle programs consume SealedBids produced by core, proving valid bid provenance without trust.

### 3.2 Bid Phase (core_v4.place_bid)

Bidder inputs: `auction_id`, `bid_amount`, `bid_nonce` — all private.

Computation (off-chain in ZK circuit):
- `bid_hash = BHP256(PseudoIdentity{ bidder, auction_id, amount, nonce })`
- `nullifier = BHP256(bid_nonce)`

Output (record): `SealedBid { owner, auction_id, bid_amount, bid_nonce, token_type }`.

Finalize (on-chain):
- `bid_commitments[bid_hash] = true`
- `bid_nullifiers[nullifier] = true`
- `auctions[auction_id].bid_count += 1`

**Observer learns:** bid_count incremented. **Nothing else.** No token movement.

### 3.3 Reveal Phase (settle_v6.reveal_bid)

Bidder consumes the `SealedBid` record. Contract escrows tokens via `credits.aleo::transfer_private_to_public`.

Output records: `EscrowReceipt` (bidder), `BidderParticipationProof` (bidder).

Finalize:
- `revealed_bids[bid_hash] = true` (bool flag only — v4+ upgrade eliminates prior u128 leak)
- `highest_bids[auction_id] = bid_amount` (plaintext, TEMPORARY until cleanup)
- `second_highest_bids[auction_id]` updated likewise
- `auction_winners[auction_id] = bid_hash` if new high

The v6 invariant: once `claim_win` executes, both `highest_bids` and `second_highest_bids` are deleted via `Mapping::remove`. The running-max is visible only during the live reveal window (~2880 blocks / ~8 hours).

### 3.4 Settlement Phase (settle_v6.claim_win, claim_win_vickrey)

Winner consumes `EscrowReceipt`. Contract pays seller via `credits.aleo::transfer_public_to_private` (recipient hidden).

The critical v6 change — settlements commitment:
```
price_commit = BHP256(SettlementCommit{ price, fee, nonce, settled_at })
settlements[auction_id] = { winner_bid_hash, price_commit, settled_at }
```

Output records: `WinnerCertificate` (winner), `SellerReceipt` (seller), `AuctionCompletionProof` (seller).

Finalize also executes:
- `highest_bids.remove(auction_id)`
- `second_highest_bids.remove(auction_id)`

**Observer learns:** settlement hash exists. Block settled at. Winner bid hash.
**Observer does NOT learn:** final price, fee, winner address, seller address.

### 3.5 Selective Disclosure (settle_v6.prove_won_auction)

Winner consumes `WinnerCertificate`. Produces a fresh signed copy demonstrating ownership of the win, without exposing price or bidder identity on-chain.

Used by: lenders (collateral proof), compliance officers (provenance), marketplaces (bid history attestation).

---

## 4. Privacy Guarantees (Informal Proof Sketches)

### 4.1 Bid-amount confidentiality during sealed phase

**Claim.** Given access to all on-chain state up to and including `place_bid`, an observer's probability of distinguishing between two bids of different amounts is negligible.

**Argument.** The only state written during `place_bid` is: `bid_commitments[bid_hash] = true`, `bid_nullifiers[nullifier] = true`, `auctions[auction_id].bid_count += 1`. The `bid_hash` is BHP256 over `{ bidder, auction_id, amount, nonce }`. BHP256 is collision-resistant and preimage-resistant under standard cryptographic assumptions. Without knowledge of at least one of `{ bidder, nonce }` the observer cannot brute-force the preimage (nonce space ≈ 2^254 for field elements). The bid_count is a public counter revealing only that *some* bid was placed. No token transfer occurs — `credits.aleo` emits no events related to this bid.

### 4.2 Permanent-state privacy of cleared price

**Claim.** Given access to all on-chain state after settlement, an observer cannot recover the final clearing price from the `settlements[auction_id]` entry alone.

**Argument.** The `settlements[auction_id].price_commit` is `BHP256(price, fee, nonce, settled_at)`. The nonce is the bidder's `bid_nonce` (known only to winner and seller via the `EscrowReceipt` → `WinnerCertificate` flow). Without the nonce, the observer faces a hash-preimage problem over a non-negligible search space, even if candidate prices are enumerable.

### 4.3 Bidder anonymity post-settlement

**Claim.** After `claim_win`, the observer cannot identify the winner's address from on-chain state.

**Argument.** The settle program uses `credits.aleo::transfer_public_to_private` for seller payout and `transfer_public_to_private` for winner refund (Vickrey case). Both operations output private credit records; the recipient address does not appear in any public mapping or event. `self.caller` is used inside the transition circuit but is never written to any settlement mapping. The `auction_winners[auction_id]` stores only the bid_hash, which is an unlinkable commitment.

### 4.4 Cross-auction unlinkability of sellers

**Claim.** Observer cannot determine whether two auctions were created by the same seller address.

**Argument.** The `seller_hash` stored in `auctions[auction_id]` is `BHP256(PseudoIdentity{ addr, salt })` where `salt = auction_id`. Two auctions by the same seller produce different auction_ids and therefore different seller_hashes. Reversal requires enumerating all possible addresses — computationally infeasible.

---

## 5. Novel Primitives

### 5.1 BidderParticipationProof

A non-transferable record issued at every `reveal_bid`:

```leo
record BidderParticipationProof {
    owner: address,
    auction_id: field,
    proof_id: field  // = bid_hash, already commits to amount
}
```

Enables: retroactive airdrops to past bidders; private reputation ("I participated in 20+ auctions" without revealing which); compliance attestations.

### 5.2 AuctionCompletionProof

Emitted at `claim_win` to the seller:

```leo
record AuctionCompletionProof {
    owner: address,           // seller
    auction_hash: field,      // BHP256(auction_id, bid_hash, amount)
    item_hash: field
}
```

Enables: portable seller reputation across wallet migrations; mainnet-launch credibility signals; cross-protocol reputation attestation.

### 5.3 Combinatorial Subset Bidding

`core_v4.place_subset_bid` accepts a `u8` bitmask encoding which items (of up to 4) the bidder wants:

```
item_mask = 0b1010 ⟹ wants items #2 and #4 only
```

At settle time, `settle_bundle_allocation` verifies the seller's chosen allocation: non-overlapping subsets, each meeting its reserve, maximizing total revenue. ZK proof ensures no individual bidder's strategy leaks to others or to the seller prior to reveal.

---

## 6. Implementation & Deployment

All four programs are deployed on Aleo Testnet.

| Program | Deploy TX | Size | Purpose |
|---------|-----------|------|---------|
| `obscura_core_v4.aleo` | `at1z7m2vhp5aznm58hz09s82qufu9fk0kypzk562f9evhtmt2hnzy8snmlhxl` | 52.68 KB | Lifecycle, 10 formats |
| `obscura_settle_v6.aleo` | `at1ujjhpkynpemgm8pqpm0qlpac9vv8nnwvl6lrkusf2uxll9n74vqqxf98xz` | 19.03 KB | ALEO settle, commits |
| `obscura_settle_stable_v4.aleo` | `at1uln0ruxy2k3v47lkrl0nawxpetphjujgws6cxt0m9uw4x4ar3srqmcapu9` | 24.96 KB | USDCx + USAD |
| `obscura_market_v2.aleo` | (prior wave) | — | Fixed sales + RFQs |

All use `@noupgrade constructor() {}` — immutable after deploy.

### 6.1 Deployment lesson

Programs above 50 KB silently reject at priority-fee < 20 M microcredits. Validators perform an opaque fee-adequacy check post-broadcast; TX hash is returned from `snarkos developer deploy --broadcast` but the program never lands and the balance is not debited. This behavior is undocumented and was discovered empirically during core_v4 deployment. Future large deploys should use `--priority-fee 20000000` minimum.

### 6.2 Ecosystem

- **Web application** — https://obscura-auction-95hm.vercel.app (React, Shield Wallet)
- **SDK** — `obscura-aleo-sdk` on npm
- **CLI** — `obscura-aleo-cli` on npm
- **MCP server** — `obscura-aleo-mcp` on npm (first AI-agent-native auction protocol on Aleo)
- **Backend indexer** — Render, PostgreSQL
- **Auction monitor bot** — Render, polls on-chain state every 30 s

---

## 7. Game-Theoretic Notes

### 7.1 Vickrey truthful bidding

Vickrey's dominant-strategy-truthful property requires that the winner pay the *second-highest* bid. Obscura implements this via `claim_win_vickrey`:
- Winner submits their `EscrowReceipt` (amount r).
- Contract reads `second_highest_bids[auction_id]` (temporary plaintext during reveal window).
- Winner pays second-price s; winner receives refund of r − s as private credit record.

Because bid amounts are sealed during the bidding phase, bidders have no information to bid strategically against. Under perfect information asymmetry, Vickrey's truthful-bidding incentive is preserved.

### 7.2 Combinatorial revenue maximization

With four items and n bidders submitting subset bids, the seller's revenue-maximization problem is NP-hard in general (weighted set-packing). For small n, it is tractable via exhaustive search in the ZK circuit. For larger n, allocation computation is offloaded off-chain, with on-chain verification of the submitted allocation's validity (non-overlap, reserve satisfaction, revenue-maximality-by-challenge).

---

## 8. Honest Limitations

Following the principle that transparent acknowledgment of limitations is itself a privacy credit, we enumerate known weaknesses:

1. **Running-max transient visibility.** `highest_bids` is plaintext during the active reveal window (~8 hours). Cleared post-settle via `Mapping::remove` (v6).
2. **Dutch price schedule is public.** `dutch_params[id] = { start_price, end_price }` is inherent to the format.
3. **English bidding is open.** The mechanism requires public ascending bids.
4. **credits.aleo transfer amount exposure.** Aleo platform constraint; unavoidable when escrowing real tokens.
5. **USDCx/USAD public transfers.** Stablecoin compliance model on Aleo; use ALEO Credits for maximum privacy.
6. **Bundle allocation ZK proof scales quadratically in bidder count.** Obscura currently caps bundle auctions at ~20 bidders for circuit-size reasons.
7. **Merkle allowlists at 16 levels (65k addresses).** Fairdrop competitor uses 20 (1M+). Upgrade scheduled for next wave.
8. **Admin-resolved disputes.** A multi-voter economic quorum (Veiled Markets-style) is on the roadmap.

---

## 9. Future Work

- **Merkle 20-level upgrade** — match Fairdrop's allowlist floor.
- **Multi-voter dispute quorum** — bonded jurors with slashing.
- **Off-chain batch auction matching** — PrivaDex-inspired dark pool mechanism as an 11th format.
- **ZK credential gating** — anonymous KYC/accredited-investor attestations.
- **Cross-program price oracle** — auction clearing prices as consumable private data for lending/derivatives.
- **Mainnet launch** — currently testnet only; mainnet-beta planned for post-Wave-5.

---

## 10. References

- Aleo Developer Documentation: https://docs.aleo.org
- Leo Language: https://leo-lang.org
- Vickrey, W. (1961). "Counterspeculation, Auctions, and Competitive Sealed Tenders."
- Obscura source: https://github.com/Ritik200238/obscura-auction
- Privacy audit per transition: see `PRIVACY.md` §10 in the repository.

---

**Document license**: CC BY 4.0. Code license: MIT.
**Last updated**: 2026-04-13.
**Status**: Wave 5 submission draft.
