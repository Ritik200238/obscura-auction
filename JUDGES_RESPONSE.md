# Obscura — Response to Wave 4 Judge Feedback

## Wave 4 Scores
Privacy 6 | Technical 7 | UX 5 | Practicality 6 | Novelty 6

## Wave 4 Feedback
> "Consider adding more auction types (English, combinatorial). The 250KB+ of Leo code across 4 contract variants with real deployment debugging ('snarkVM 31-limit compliance', 'Trim to 28 transitions') is exceptionally deep. Polish the frontend UX to match the contract quality."

---

## Issue 1: "Consider adding more auction types (English, combinatorial)"

English and Dutch were already in the Wave 4 contract (`obscura_v4.aleo` — transitions `bid_english`, `bid_english_usdcx`, `settle_english`, `create_dutch_auction`, `bid_dutch`, `bid_dutch_usdcx`). The judge couldn't test them because of a critical frontend bug: `PROGRAM_ID` was set to `obscura_v5.aleo`, a program that was never deployed on testnet. Every wallet transaction silently failed.

**Root cause:** During development, the contract source was renamed from v4 to v5 but never redeployed. The frontend was updated to v5 but the testnet still had v4. This is entirely our fault.

**Wave 5 fix:**
- PROGRAM_ID now verified against testnet before every submission (Rule 0 in our CLAUDE.md)
- Expanded from 4 to 10 auction formats: Sealed-Bid, Vickrey, Dutch, English, Bundle (combinatorial as requested), Multi-Unit, Candle, Reverse, Blind Dutch, Timed Escalation
- Bundle auctions support both full-package and combinatorial subset bidding (bitmask-based item selection)
- Every format has a dedicated bid panel in the frontend
- Core contract: `obscura_core_v3.aleo` — 29 on-chain functions

## Issue 2: "Polish the frontend UX to match the contract quality"

This was our biggest weakness — UX scored 5 in both Wave 3 and Wave 4.

**Wave 5 changes:**
- Every auction type has a dedicated bid panel (BundleBidPanel, MultiUnitBidPanel, CandleBidPanel, ReverseBidPanel, BlindDutchBidPanel, TimedEscalationBidPanel)
- TransactionProgress component on every TX-triggering button
- Mode-specific form fields in Create page (item count for Bundle, qty+price for Multi-Unit, max budget for Reverse)
- 6 primary formats visible + 4 advanced behind a toggle (avoids "too busy" UI)
- Marketplace pages (Buy Now, Token Sales, Procurement) added to navigation with correct program routing
- PrivacyDashboard + PrivacyScore components show real-time privacy status per auction
- All mode badges and auction cards handle all 10 types with distinct colors

## Issue 3: Why Privacy Dropped 8→6

The privacy model itself didn't change between Wave 3 and Wave 4. The score dropped because the judge couldn't verify any privacy features were working (all transactions failed due to the PROGRAM_ID bug).

**Wave 5 privacy upgrades (deployed on testnet):**

1. **Commit-based settlements** (`obscura_settle_v6.aleo`): The `settlements` mapping no longer stores plaintext `final_price` and `fee_collected`. Instead, it stores `price_commit = BHP256(SettlementCommit{price, fee, nonce, settled_at})`. Zero plaintext amounts in any settlement mapping. This matches ZKPerp's "finalize only sees a hash" approach.

2. **Per-auction pseudonymous IDs**: Seller hash is now `BHP256(PseudoIdentity{addr, auction_nonce})` — different hash per auction, preventing cross-auction identity correlation.

3. **Bid nullifiers**: `bid_nullifiers` mapping stores `BHP256(bid_nonce)` instead of bid hashes derived from bidder address. Prevents brute-force attacks on sealed bid amounts.

4. **Participation proofs**: `ParticipationProof` private record proves "I participated in auction X" without revealing amount, identity, or outcome.

5. **Revealed bids as boolean**: `revealed_bids` mapping stores `true/false` (was bid revealed?) instead of the actual bid amount. Amount commitment lives in bid_hash.

6. **Mapping cleanup post-settlement**: `highest_bids` and `second_highest_bids` are removed (via `Mapping::remove`) after `claim_win` — winning amounts don't persist on-chain indefinitely.

**What remains intentionally public and why:**
- `bid_count` in auctions mapping: needed for `close_bidding` to determine EXPIRED vs REVEALING state
- `token_type` in auctions mapping: needed for bid validation (correct token path)
- Token transfer amounts during `reveal_bid`: inherent `credits.aleo` CPI constraint — Fairdrop has the same limitation and documents it honestly

## Architecture

4 programs deployed on Aleo Testnet:

| Program | Functions | Purpose |
|---------|-----------|---------|
| `obscura_core_v3.aleo` | 29 | Auction lifecycle, 10 formats, Merkle gating, reputation |
| `obscura_settle_v6.aleo` | 10 | ALEO settlement with commit-based privacy |
| `obscura_settle_stable_v4.aleo` | 13 | USDCx + USAD settlement with privacy hardening |
| `obscura_market_v2.aleo` | 15 | Fixed sales, RFQ, token sales, royalties |

Total: 67 on-chain functions across 4 deployed programs.

The settle programs import `obscura_core_v3.aleo` for record types via CPI — consuming a `SealedBid` record proves it was created by the core program without any trust assumption.

## SDK

Published on npm as `obscura-aleo-sdk` (v0.5.0). Includes typed clients for all 4 programs, transaction builders, and Merkle proof construction helpers.

## What We Learned

The Wave 4 failure was not a code quality issue — the judge praised the contract depth. It was an integration failure: the frontend pointed to a nonexistent program. We've added a mandatory deployment verification checklist (Rule 0) to prevent this from ever happening again. Every program ID is now verified against the testnet API before submission.
