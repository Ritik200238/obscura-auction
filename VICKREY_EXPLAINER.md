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
  - You might win when someone bid 105 and end up paying 105. No benefit over bidding 100. ✗

**Conclusion**: Bidding your true value is a dominant strategy. It's rational regardless of what others do. This is called **incentive compatibility** or **truthfulness**.

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
| Fake second bid | Undetectable | `second_highest_bids` mapping updated by on-chain finalize logic — cannot be manipulated |
| Inflate second price | Trivial for seller | Impossible: all bids are verified hashes |
| Wrong winner | Seller decides | Cryptographic proof required: only true EscrowReceipt holder can claim |
| Dispute second price | No recourse | `second_highest_bids[auction_id]` is public on-chain and immutable |

Obscura tracks the second-highest bid in the `second_highest_bids` on-chain mapping, updated atomically during the `reveal_bid` finalize step. No party — not the seller, not the platform — can alter this value after it's set.

---

## Why This Is First on Aleo

Vickrey auctions require two things that are technically difficult on public blockchains:

1. **Sealed bids**: Bidders cannot see each other's bids during the bidding phase
2. **Verifiable second-price**: After reveal, anyone can verify the winner paid exactly the second-highest bid, on-chain

On Ethereum-style public blockchains:
- All state is public — you cannot seal bids without elaborate commit-reveal schemes
- Even with commit-reveal, the ordering of reveals leaks information
- Implementing verifiable Vickrey requires complex off-chain proofs

**On Aleo, Obscura achieves this natively:**

```
place_bid:
  → SealedBid record (private) — bid amount encrypted, only owner can read
  → bid_commitments[hash] = true (public) — proves bid was submitted, reveals nothing

reveal_bid:
  → Consumes SealedBid record (proves ownership, amount disclosed)
  → Updates highest_bids and second_highest_bids atomically in finalize
  → Both mappings are public and immutable on-chain
```

The `finalize_reveal_bid` function is the key innovation:

```
if revealed_amount > current_highest:
    second_highest_bids[auction_id] = current_highest
    highest_bids[auction_id] = revealed_amount
else if revealed_amount > current_second:
    second_highest_bids[auction_id] = revealed_amount
```

This runs on-chain, in the finalize block, with no possibility of external manipulation. Aleo's finalize execution is atomic and trustless.

**No other auction protocol on the Aleo blockchain has implemented this.**

---

## Real-World Use Cases

Vickrey auctions are used everywhere high-value, private bidding matters:

**Spectrum auctions**: Governments sell wireless spectrum licenses. Bidders (telecom companies) need sealed bids to prevent collusion. The FCC has studied Vickrey mechanisms extensively.

**Google Ads (Generalized Vickrey)**: Google's AdWords uses a generalized form of second-price auctions. You bid your max CPC; you pay just above the next bidder's bid. Same principle.

**Domain name sales**: ICANN's new gTLD auction used sealed-bid second-price mechanisms for initial rights.

**Procurement**: Government contracts, corporate purchasing — sealed bids prevent supplier collusion.

**NFT drops**: High-value digital art auctions where artists want fair price discovery without bid manipulation.

**Private equity secondary sales**: When stakes in private companies are sold, sealed bids prevent leak of valuation.

---

## Obscura's Implementation

```
Contract: obscura_auction.aleo
Mode:     auction_mode = 2u8 (MODE_VICKREY)

Key mappings:
  highest_bids[auction_id] → u128       (highest revealed bid)
  second_highest_bids[auction_id] → u128 (second-highest revealed bid)

Requirements:
  - Minimum 2 revealed bids to settle in Vickrey mode
  - finalize_auction checks bid_count >= 2 when auction_mode == MODE_VICKREY

Guarantee:
  - second_highest_bids is set by on-chain finalize code
  - No party can alter it post-reveal
  - Any observer can verify the value on-chain via Explorer API
```

The second-highest bid value is stored on-chain at `second_highest_bids[auction_id]`. After settlement, it is publicly verifiable by anyone with the auction ID. This is the "proof of fair auction" — not a ZK proof in the cryptographic sense, but a publicly auditable on-chain record that the second price was computed correctly.

---

## Summary

| Property | Obscura Vickrey | Traditional Vickrey |
|----------|----------------|---------------------|
| Bid privacy during bidding | Full (ZK records) | Depends on auctioneer |
| Second price verifiability | On-chain, public | Auctioneer's word |
| Seller manipulation | Impossible | Possible |
| Incentive compatibility | Proven by mechanism | Claimed by auctioneer |
| First on Aleo | Yes | N/A |
