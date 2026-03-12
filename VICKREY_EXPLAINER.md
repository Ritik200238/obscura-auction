# Vickrey Auctions on Aleo — Why This Matters

## What Is a Vickrey Auction?

A Vickrey auction (also called a **second-price sealed-bid auction**) is a type of auction where:

1. All bidders submit sealed bids simultaneously — no one sees anyone else's bid
2. The **highest bidder wins**
3. The winner pays the **second-highest bid**, not their own

This was invented by economist William Vickrey in 1961, who won the Nobel Prize in Economics in 1996 partly for this work.

---

## Why Second-Price? The Game Theory

In a standard (first-price) sealed auction, bidders face a dilemma:

> "I value this item at 100 ALEO. If I bid 100 and win, I get zero surplus. If I bid 70, I might lose. What do I do?"

This leads to **bid shading** — everyone bids below their true valuation. The result is an inefficient market where prices don't reflect real values.

In a Vickrey auction, the optimal strategy is **always to bid your true valuation**:

- If your true value is 100 and you bid 100:
  - You win when highest bidder — you pay the 2nd price (say 80). Surplus = 20. ✓
  - You lose when someone else bids 110. No loss. ✓
- If you bid 70 instead (underbidding):
  - You might lose to a 90 bid that you would have beaten. ✗
- If you bid 120 instead (overbidding):
  - You might win when someone bid 105 and end up paying 105 — you overpaid. ✗

**Conclusion**: Bidding your true value is a dominant strategy. It's rational regardless of what others do. This is called **incentive compatibility** or **truthfulness**.

---

## Concrete Numerical Example: Full Auction Flow

### Setup

A seller lists a rare digital art piece on Obscura in **Vickrey mode** with:
- Reserve price: 50 ALEO (stored as BHP256 hash)
- Token: ALEO Credits
- Duration: 24 hours

### Bidding Phase (amounts invisible)

| Bidder | True Valuation | Bid Amount | On-Chain Visible? |
|--------|---------------|------------|-------------------|
| Alice | 100 ALEO | 100 ALEO | NO — encrypted in SealedBid record |
| Bob | 80 ALEO | 80 ALEO | NO — encrypted in SealedBid record |
| Charlie | 60 ALEO | 60 ALEO | NO — encrypted in SealedBid record |

Each bidder calls `place_bid`. **No tokens transfer.** The only public change is `bid_count: 0 → 1 → 2 → 3`. An observer knows "3 bids were placed" but nothing about amounts.

### Reveal Phase (amounts become public)

After `close_bidding`, each bidder reveals:

| Bidder | Revealed Amount | Escrowed | highest_bids | second_highest_bids |
|--------|----------------|----------|-------------|-------------------|
| Alice (reveals first) | 100 ALEO | 100 ALEO | 100 | 0 |
| Bob (reveals second) | 80 ALEO | 80 ALEO | 100 | 80 |
| Charlie (reveals third) | 60 ALEO | 60 ALEO | 100 | 80 |

Total escrowed: 240 ALEO in `auction_escrow`.

### Settlement

Seller calls `finalize_auction(auction_id, 50)`:
- Reserve price verified: `BHP256(50) == stored_hash` ✓
- Highest bid (100) ≥ reserve (50) ✓
- Second-highest bid (80) > 0 ✓ (Vickrey requires ≥ 2 revealed bids)
- Status → SETTLED
- `settlement_proofs[auction_id]` = BHP256(SettlementProof{...}) stored on-chain

### Claim (Vickrey Settlement Math)

**Alice (winner) calls `claim_win_vickrey`:**

```
Alice's escrowed amount:     100.000000 ALEO (100000000 microcredits)
Second-highest bid:           80.000000 ALEO (from on-chain mapping)

Platform fee (1% of sale price):
  fee = 80 × 100 / 10000 =    0.800000 ALEO

Seller receives:
  second_price - fee = 80 - 0.8 = 79.200000 ALEO
  → Delivered as private credits record (recipient hidden)

Alice receives (refund):
  escrowed - second_price = 100 - 80 = 20.000000 ALEO
  → Delivered as private credits record

Platform treasury receives:
  fee = 0.800000 ALEO

Verification:
  seller (79.2) + winner refund (20.0) + fee (0.8) = 100.0 ALEO ✓
  = Alice's original escrowed amount ✓
```

**Bob and Charlie (losers) call `claim_refund`:**

```
Bob refunded:    80.000000 ALEO → private credits record
Charlie refunded: 60.000000 ALEO → private credits record
```

### Final Accounting

| Participant | Started With | Ended With | Net Change |
|-------------|-------------|------------|------------|
| Alice (winner) | -100 ALEO escrowed | +20 ALEO refund + item | -80 ALEO (paid 2nd price) |
| Bob (loser) | -80 ALEO escrowed | +80 ALEO refund | 0 |
| Charlie (loser) | -60 ALEO escrowed | +60 ALEO refund | 0 |
| Seller | item | +79.2 ALEO | +79.2 ALEO |
| Platform | — | +0.8 ALEO fee | +0.8 ALEO |

**Result**: Alice valued the item at 100 ALEO but only paid 80 ALEO (the second price). She captured 20 ALEO of consumer surplus — her incentive for bidding truthfully. If she had bid 90 (shading), she would have still won and still paid 80, but risked losing if Bob had bid 95.

---

## Why This Is Different from First-Price

In the same scenario with **First-Price** mode:

| | First-Price | Vickrey |
|---|---|---|
| Alice's optimal bid | ~85 ALEO (shade below true value 100) | 100 ALEO (bid true value) |
| Alice pays | 85 ALEO (her bid) | 80 ALEO (second-highest bid) |
| Seller receives | 84.15 ALEO (85 - 1% fee) | 79.2 ALEO (80 - 1% fee) |
| Alice's surplus | 15 ALEO | 20 ALEO |
| Price discovery | Poor — bids don't reflect true values | Excellent — bids reflect true values |
| Strategy | Complex — must guess what others bid | Simple — always bid true value |

**Why Vickrey is better:**
1. **Truthful bidding** — Bidders don't need to strategize. The dominant strategy is transparent.
2. **Efficient allocation** — The item always goes to the person who values it most.
3. **Fair pricing** — The price reflects market competition (second bidder's willingness to pay), not the winner's maximum.
4. **Revenue equivalence** — In theory, the seller's expected revenue is the same under both formats (Revenue Equivalence Theorem). In practice, Vickrey often generates higher revenue because bidders don't shade.

---

## Why ZK Is Required for Vickrey Integrity

Here's the critical problem: **in a traditional Vickrey auction, you have to trust the auctioneer.**

Without cryptographic proof:
- The seller can claim the second-highest bid was 90 ALEO even if it was 10 ALEO
- The seller can add a fake second bidder to inflate the price
- The seller can reject the winner and re-auction to a preferred buyer
- No one can verify the winner paid the correct price

**With zero-knowledge proofs on Aleo, these attacks become impossible:**

| Attack | Without ZK | With Obscura |
|--------|-----------|--------------|
| Fake second bid | Undetectable | `bid_commitments` hash must exist from real `place_bid` TX |
| Inflate second price | Trivial for seller | `second_highest_bids` updated by on-chain finalize logic — immutable |
| Wrong winner declared | Seller decides | `auction_winners` set by on-chain comparison — cryptographic proof required to claim |
| Dispute second price | No recourse | `second_highest_bids[auction_id]` is public, immutable, and auditable |
| Tamper with settlement | Undetectable | `settlement_proofs[auction_id]` stores tamper-evident hash |
| Lie about payment amount | No verification | `payment_proofs[auction_id]` stores verifiable commitment |

Obscura tracks the second-highest bid in the `second_highest_bids` on-chain mapping, updated atomically during the `finalize_reveal_bid` step. No party — not the seller, not the platform — can alter this value after it's set.

---

## Why This Is First on Aleo

Vickrey auctions require two things that are technically difficult on public blockchains:

1. **Sealed bids**: Bidders cannot see each other's bids during the bidding phase
2. **Verifiable second-price**: After reveal, anyone can verify the winner paid exactly the second-highest bid, on-chain

On Ethereum-style public blockchains:
- All state is public — you cannot seal bids without elaborate commit-reveal schemes
- Even with commit-reveal, the ordering of reveals leaks information
- Token transfers during bidding leak amounts
- Implementing verifiable Vickrey requires complex off-chain proofs

**On Aleo, Obscura achieves this natively:**

```
place_bid:
  → SealedBid record (private) — bid amount encrypted, only owner can read
  → bid_commitments[hash] = true (public) — proves bid was submitted, reveals nothing
  → NO TOKEN TRANSFER — amount completely invisible

reveal_bid:
  → Consumes SealedBid record (proves ownership, amount disclosed)
  → Updates highest_bids and second_highest_bids atomically in finalize
  → Both mappings are public and immutable on-chain
  → Token escrow happens here (amount intentionally public)

claim_win_vickrey:
  → Caller passes claimed_second_price as private input
  → Finalize verifies against second_highest_bids[auction_id]
  → Seller paid (second_price - fee), winner refunded (escrowed - second_price)
  → settlement_proofs and payment_proofs stored on-chain
```

**No other auction protocol on the Aleo blockchain has implemented this.**

---

## Real-World Use Cases

Vickrey auctions are used everywhere high-value, private bidding matters:

**Spectrum auctions**: Governments sell wireless spectrum licenses. Bidders (telecom companies) need sealed bids to prevent collusion. The FCC has studied Vickrey mechanisms extensively.

**Google Ads (Generalized Vickrey)**: Google's AdWords uses a generalized form of second-price auctions. You bid your max CPC; you pay just above the next bidder's bid.

**Domain name sales**: ICANN's new gTLD auction used sealed-bid second-price mechanisms for initial rights.

**Procurement**: Government contracts, corporate purchasing — sealed bids prevent supplier collusion.

**NFT drops**: High-value digital art auctions where artists want fair price discovery without bid manipulation.

**Private equity secondary sales**: When stakes in private companies are sold, sealed bids prevent leak of valuation.

---

## Obscura's Implementation

```
Contract: obscura_v3.aleo
Mode:     auction_mode = 2u8 (MODE_VICKREY)

Key mappings:
  highest_bids[auction_id] → u128       (highest revealed bid)
  second_highest_bids[auction_id] → u128 (second-highest revealed bid)

Key transitions:
  claim_win_vickrey         → ALEO: seller gets 2nd price - fee, winner refunded difference
  claim_win_vickrey_usdcx   → USDCx: same logic, public balance transfers

Requirements:
  - Minimum 2 revealed bids to settle in Vickrey mode
  - finalize_auction checks second_highest_bids > 0 when auction_mode == MODE_VICKREY
  - If only 1 bid revealed → STATUS_FAILED (all bidders refunded)

Routing logic:
  - If highest_bid == second_highest_bid → use claim_win (no refund needed)
  - If highest_bid > second_highest_bid → use claim_win_vickrey (refund difference)
  - Finalize guards enforce correct routing

Proofs:
  - settlement_proofs[auction_id] = BHP256(SettlementProof{auction_id, highest, second, winner_hash, block})
  - payment_proofs[auction_id] = BHP256::commit_to_field(amount, nonce_scalar)
```

The second-highest bid value is stored on-chain at `second_highest_bids[auction_id]`. After settlement, it is publicly verifiable by anyone with the auction ID. Combined with the settlement proof hash, this provides "proof of fair auction" — a publicly auditable on-chain record that the second price was computed correctly and the settlement was not tampered with.

---

## Summary

| Property | Obscura Vickrey | Traditional Vickrey | First-Price Sealed |
|----------|----------------|---------------------|-------------------|
| Bid privacy during bidding | Full (ZK records, no transfer) | Depends on auctioneer | Full (ZK records, no transfer) |
| Second price verifiability | On-chain, immutable, auditable | Auctioneer's word | N/A |
| Seller manipulation | Impossible (on-chain logic) | Possible | Possible (can reject bids) |
| Incentive compatibility | Mathematically proven | Claimed by auctioneer | Not incentive-compatible |
| Settlement integrity | Settlement proofs on-chain | None | Settlement proofs on-chain |
| Payment verifiability | Payment proofs on-chain | None | Payment proofs on-chain |
| Winner proves ownership | ZK transition (prove_won_auction) | Paper certificate | ZK transition |
| First on Aleo | Yes | N/A | N/A |
