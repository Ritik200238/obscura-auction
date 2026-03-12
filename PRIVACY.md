# Obscura Privacy Model

## Design Philosophy

Obscura treats privacy as a protocol-level guarantee, not an application-layer feature. Every design decision starts with the question: "What does an observer learn from this?" The answer should always be: "As little as cryptographically possible."

Traditional auction platforms expose bid amounts, bidder identities, and settlement details either in plaintext or through trivially reversible obfuscation. Even "private" blockchain auctions often leak data through public mappings, resolver patterns, or API responses.

Obscura uses Aleo's programmable privacy to ensure that bid amounts are truly invisible (encrypted in private records), bidder identities are never exposed on-chain, and settlement happens via private credit transfers with no public recipient trace.

---

## What Is Public vs Private

### On-Chain Public Data (13 Mappings)

| Mapping | Data | Privacy Assessment |
|---------|------|--------------------|
| `auctions` | AuctionData struct | Contains only hashes and counters — no plaintext addresses or amounts |
| `bid_commitments` | bool | Prevents replay; reveals nothing about bid content |
| `revealed_bids` | u128 | Bid amounts visible ONLY after voluntary reveal |
| `highest_bids` | u128 | Visible post-reveal only |
| `second_highest_bids` | u128 | Visible post-reveal only (Vickrey tracking) |
| `auction_winners` | field | Winner's bid hash — not their address |
| `program_balance` | u128 | Aggregate pool by token type, not per-user |
| `auction_escrow` | u128 | Total escrowed per auction (sum, not individual) |
| `platform_treasury` | u128 | Accumulated fees by token type |
| `settlements` | SettlementData | Settlement metadata — winner_bid_hash, final_price, fee, timestamp |
| `platform_config` | PlatformConfig | Admin hash, fee rates — no admin address |
| `settlement_proofs` | field | BHP256 hash of SettlementProof — tamper-evident, not information-revealing |
| `payment_proofs` | field | BHP256 commit of payment amount — hiding property prevents amount inference |

**Key insight**: No mapping contains a plaintext address. The `auctions` mapping stores `seller_hash` (a BHP256 hash of the seller's address cast to field), which is computationally infeasible to reverse. The `auction_winners` mapping stores a bid commitment hash — not the winner's address.

### On-Chain Private Data (4 Record Types)

| Record | Owner | Contains | Consumed By |
|--------|-------|----------|-------------|
| `SealedBid` | Bidder | auction_id, bid_amount, bid_nonce, token_type | `reveal_bid` or `reveal_bid_usdcx` |
| `EscrowReceipt` | Bidder | auction_id, escrowed_amount, bid_nonce, token_type | `claim_refund*` or `claim_win*` |
| `WinnerCertificate` | Winner | auction_id, item_hash, winning_amount, certificate_id, token_type | Never consumed (proof of ownership) |
| `SellerReceipt` | Seller | auction_id, item_hash, sale_amount, fee_paid, token_type | Never consumed (proof of sale) |

These records are encrypted on Aleo and can only be decrypted by the owner's view key. No other participant, observer, or the contract itself can read their contents without the owner's cooperation.

---

## Privacy Through the Auction Lifecycle

### Phase 1: Creation

```
Seller calls create_auction(item_hash, category, reserve_price, auction_mode, token_type, nonce, deadline)

What becomes public:
  - auction_id (derived from BHP256 hash of AuctionSeed — not predictable)
  - item_hash (BHP256 hash of item data — not reversible)
  - seller_hash = BHP256(seller_address as field) — NOT the address
  - category (1-4, generic enum)
  - token_type (1 or 2)
  - auction_mode (1 or 2)
  - deadline (block height)
  - reserve_price_hash = BHP256(reserve_price) — NOT the amount

What stays private:
  - Seller's actual address (used only in private transition scope)
  - Reserve price plaintext (only hash stored)
  - Item title/description (stored encrypted in backend, if at all)
```

**Observer learns**: "An auction exists in category X with deadline at block Y, using token type Z." They cannot determine who created it or what the reserve price is.

### Phase 2: Bidding

```
Bidder calls place_bid(auction_id, amount, nonce, token_type)

What becomes public:
  - bid_commitments[hash] = true (prevents replay, reveals nothing about amount)
  - bid_count += 1

What stays private:
  - Bid amount (in SealedBid record, encrypted)
  - Bidder's address (record owner, not in any mapping)
  - Bid nonce (random, in record)

Token flow: NONE. No tokens transferred at bid placement.
```

**Observer learns**: "Someone placed a bid on this auction. bid_count incremented." They learn nothing about the bid amount. No transfer occurs, so the credits.aleo mapping reveals nothing.

**This is the critical privacy innovation.** By deferring token transfer to the reveal phase, we eliminate the primary privacy leak of naive sealed-bid implementations. An observer monitoring credits.aleo transfers during the bidding phase sees exactly zero activity related to this auction's bids.

### Phase 3: Revealing (with Escrow)

```
Bidder calls reveal_bid(sealed_bid_record, credits_record)

What becomes public:
  - revealed_bids[bid_hash] = amount (intentionally public — this IS the reveal)
  - highest_bids and second_highest_bids updated
  - auction_escrow[auction_id] += amount (tokens now locked)

What stays private:
  - Bidder's address (still only in consumed record + EscrowReceipt)
  - Link between bidder address and specific bid amount

Token flow:
  credits.aleo/transfer_private_to_public(record, program_address, amount)
  - Amount is visible here — BUT at this point, amount is INTENTIONALLY public
  - The sender is hidden (private credits record consumption)
```

**Observer learns**: "Bid hash X was revealed with amount Y. Y ALEO was escrowed." This is correct — the reveal SHOULD make amounts public. The critical point: amounts were hidden during the sealed phase when they mattered strategically.

**Bidders who don't reveal**: Hold a worthless SealedBid record. No tokens were locked before reveal, so no refund is needed.

### Phase 4: Settlement

```
Seller calls finalize_auction(auction_id, reserve_price)

What becomes public:
  - auction_winners[auction_id] = winning_bid_hash
  - settlements[auction_id] = SettlementData
  - settlement_proofs[auction_id] = BHP256(SettlementProof{...})
  - Reserve price (disclosed as finalize argument)

What stays private:
  - Winner's address (winner self-identifies later)
  - Seller's address (still only seller_hash on-chain)
```

**Observer learns**: "The auction settled. The winning bid hash is X. The reserve price was Y. A tamper-evident settlement proof is stored." They still don't know WHO won or WHO the seller is.

**Privacy trade-off**: The reserve price is disclosed at settlement. This is an accepted trade-off — by this point, all bids are already revealed, so the reserve price no longer provides strategic advantage. The hash verification ensures the seller cannot lie.

### Phase 5: Claiming

```
Winner calls claim_win(escrow_receipt, seller_address, item_hash)

Token flow (ALEO):
  credits.aleo/transfer_public_to_private(seller_address, payout)
  → Creates encrypted credit record for seller (recipient hidden)

What becomes public:
  - Program balance decreases (aggregate)
  - payment_proofs[auction_id] = BHP256::commit_to_field(amount, nonce_scalar)

What stays private:
  - Seller address (private input, not in finalize)
  - Winner address (self.caller, not stored in mapping)
  - Payment amount (public-to-private creates private record)
```

**Observer learns**: "The program's public balance decreased. A payment commitment was stored." They cannot determine who received the payment or how much went to whom, because `transfer_public_to_private` creates encrypted credit records.

---

## Vickrey Privacy Implications

### The Refund Amount Information Leak

In Vickrey auctions, the winner is refunded the difference between their escrowed amount and the second-highest bid. This refund has privacy implications:

```
Example:
  Winner escrowed: 100 ALEO (public — this was their revealed bid)
  Second-highest: 80 ALEO (public — this is in second_highest_bids mapping)
  Refund amount: 20 ALEO (derivable from the two public values)
```

**The refund amount itself does not create a NEW information leak** because both the winner's escrowed amount and the second-highest bid are already public (post-reveal). The refund is simply `escrowed - second_highest`, which anyone can compute.

However, there is a **timing correlation risk**: an observer watching `credits.aleo/transfer_public_to_private` transactions may see two transfers in the same block from the program's address — one for seller_payout and one for winner_change. The amounts are:
- `seller_payout = second_highest - fee`
- `winner_change = escrowed - second_highest`

Since both amounts are already derivable from public data, this does not leak new information. The observer already knows the math; the transfers merely confirm it.

**Known trade-off**: The existence of a refund transfer indirectly confirms which claim transition was used (`claim_win_vickrey` vs `claim_win`). This reveals that the winner bid more than the second price — but this is inherent to the Vickrey mechanism and is not a privacy defect.

### USDCx Vickrey Privacy

For USDCx Vickrey auctions, refunds use `transfer_public` (public balance transfer), which means both the recipient address and amount are visible. This is a weaker privacy posture than ALEO Vickrey, where refunds use `transfer_public_to_private` (recipient hidden).

**Recommendation for maximum privacy**: Use ALEO Credits for Vickrey auctions. USDCx provides convenience but trades privacy for stablecoin denomination.

---

## Attack Vector Analysis

### 1. Bid Amount Deanonymization (During Sealed Phase)

**Attack**: Observer monitors `credits.aleo/transfer_private_to_public` events to correlate bid amounts with auction escrow increases.

**Mitigation**: In Obscura v3, **no token transfer occurs during `place_bid`**. The escrow happens at `reveal_bid`, when amounts are intentionally public. There is literally zero credits.aleo activity to monitor during the sealed bidding phase.

**Residual risk**: NONE during sealed phase. This is the primary privacy improvement over naive implementations.

### 2. Seller Identity Correlation

**Attack**: Observer computes BHP256 hashes of known addresses and compares against `seller_hash`.

**Mitigation**: BHP256 is a collision-resistant hash function. To reverse it, an attacker would need to hash every possible Aleo address (~2^253 space) and compare. This is computationally infeasible.

**Residual risk**: NEGLIGIBLE. Unless the attacker already knows the seller's address and wants to confirm it — in which case the hash acts as a confirmation oracle. This is inherent to deterministic hashing.

### 3. Winner Identification via claim_win Timing

**Attack**: Observer watches for `claim_win` transaction and checks the sender.

**Mitigation**: `self.caller` is used inside the transition (off-chain execution) but is NOT stored in any public mapping. The finalize function only verifies the bid commitment hash, not the caller's address. The winner's identity is never written to any public state.

**Residual risk**: LOW. Aleo's transaction model may reveal the sender's address in transaction metadata (depending on network-level privacy), but the contract itself does not leak it.

### 4. Bid Sniping / Front-Running

**Attack**: Attacker waits until the last moment to place a winning bid.

**Mitigation**: Anti-sniping mechanism extends the deadline by 40 blocks (~10 minutes) whenever a bid is placed within the final 40-block window.

**Residual risk**: NONE. Deterministic and enforced on-chain.

### 5. Bid Replay / Double-Reveal

**Attack**: Bidder attempts to use the same bid commitment twice, or reveal the same sealed bid multiple times.

**Mitigation**: `bid_commitments` mapping stores all used commitment hashes. The SealedBid record is consumed (destroyed) upon reveal — it physically cannot be used again in Aleo's UTXO model.

**Residual risk**: NONE. Aleo's record consumption is cryptographically enforced.

### 6. Winner Double-Spend (Refund After Winning)

**Attack**: Winner calls `claim_win` then also `claim_refund`.

**Mitigation**: `claim_refund` computes the BidCommitment hash from the EscrowReceipt and checks that it does NOT match `auction_winners[auction_id]`. The EscrowReceipt is also consumed by `claim_win`, so it physically cannot be used for `claim_refund`.

**Residual risk**: NONE. Double protection — mapping check AND record consumption.

### 7. Settlement Proof Tampering

**Attack**: Malicious party claims the auction settled with different terms.

**Mitigation**: `settlement_proofs[auction_id]` stores `BHP256(SettlementProof{auction_id, highest_bid, second_highest, winner_bid_hash, settled_at})`. Any third party can recompute this hash from public on-chain data and verify integrity.

**Residual risk**: NONE. The proof is deterministic and publicly verifiable.

### 8. USDCx Cross-Token Information Leak

**Attack**: USDCx uses public balance transfers (`transfer_public` / `transfer_public_as_signer`), potentially revealing bidder/seller addresses.

**Mitigation**:
- During bidding (`place_bid`): No token transfer — USDCx users get the same zero-transfer privacy as ALEO users during the sealed phase.
- During reveal (`reveal_bid_usdcx`): `transfer_public_as_signer` reveals the signer's address. However, at this point the bidder is voluntarily revealing their bid — the address leak is concurrent with the intentional amount disclosure.
- During claim/refund: `transfer_public` reveals the recipient address. This is a weaker privacy posture than ALEO's `transfer_public_to_private`.

**Residual risk**: MEDIUM for USDCx users during reveal/claim phases. **Recommendation**: Use ALEO Credits for maximum privacy. USDCx is a convenience/stability option.

### 9. Payment Proof Privacy

**Attack**: Observer tries to determine the payment amount from `payment_proofs[auction_id]`.

**Mitigation**: The payment proof uses `BHP256::commit_to_field(amount_field, nonce_scalar)`, which has the **hiding property** — without the nonce scalar (derived from the bidder's private `bid_nonce`), the commitment cannot be opened. Even if an observer enumerates common bid amounts, they cannot verify the commitment without the nonce.

**Residual risk**: NONE unless the winner's bid_nonce is compromised. The nonce is stored only in the winner's private records.

---

## Comparison with Competitors

| Privacy Aspect | Obscura | NullPay | Veiled Markets |
|----------------|---------|---------|----------------|
| Bid amounts during sealed phase | **Completely private** — no token transfer | N/A (invoices, not auctions) | N/A (prediction markets) |
| Bidder identity | Never on-chain | Invoice hash searchable | Address in plaintext (some mappings) |
| Seller identity | BHP256 hash only | Invoker address visible in some paths | Address in plaintext |
| Winner identity | Self-identifies (no public announcement) | N/A | Public in mapping |
| Payment privacy (ALEO) | `transfer_public_to_private` (recipient hidden) | `transfer_private` (full privacy) | `transfer_public_to_private` |
| Payment privacy (USDCx) | `transfer_public` (recipient visible) | `transfer_public` | `transfer_public` |
| Reserve price | Hash until settlement | N/A | N/A |
| Settlement integrity | Settlement proofs + payment proofs on-chain | None | None |
| Selective disclosure | `prove_won_auction` ZK transition | None | None |
| Observer knowledge | Hashes + counters + status only | Full invoice details via API | Full market details, resolver/disputer addresses |
| Number of public mappings | 13 (all hash/counter-based) | ~4 (with invoice data) | 18+ (with addresses) |

---

## Backend Privacy

The off-chain backend stores auction metadata (titles, descriptions) for discoverability. All personally identifiable information is encrypted at rest:

```
Encryption: AES-256-GCM (authenticated encryption)
Key derivation: HKDF(master_key, salt = table_name + column_name)
Encrypted fields: seller_address, bidder_address
Format: iv_hex:ciphertext_hex:auth_tag_hex
```

The backend is a convenience layer — it is NOT required for the auction protocol to function. All critical state lives on-chain. If the backend is compromised, an attacker gains:
- Auction titles and descriptions (not sensitive)
- Encrypted address blobs (AES-256-GCM, requires master key to decrypt)

They do NOT gain:
- Bid amounts (on-chain, in private records)
- Winner identities (never stored in backend)
- Payment records (on-chain, in private records)

---

## Known Limitations

1. **Credits transfer amounts visible at reveal**: When a bidder calls `reveal_bid`, the `transfer_private_to_public` amount is visible in credits.aleo. This is intentional — the reveal phase is designed to make amounts public.

2. **Reserve price disclosed at settlement**: The seller must reveal the reserve price to finalize. By this point, all bids are already revealed. The hash verification ensures integrity.

3. **Highest and second-highest bids are public post-reveal**: After the reveal phase, these mappings contain plaintext amounts. This is inherent to commit-reveal — revealed bids are, by definition, no longer private.

4. **Item hash is deterministic**: `BHP256(item_data)` produces the same hash for the same input. Mitigated by including a random nonce in the auction seed.

5. **USDCx reveals addresses during reveal/claim**: `transfer_public_as_signer` and `transfer_public` expose sender/recipient addresses. Use ALEO Credits for maximum privacy.

6. **Vickrey refund amount is derivable**: The difference between the winner's escrowed amount and the second price is publicly computable. This does not leak new information beyond what's already in the reveal mappings.

These are well-understood trade-offs, not design flaws. Each exists because the alternative would break the auction's game-theoretic properties or Aleo's token model constraints.
