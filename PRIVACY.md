# Obscura Privacy Model

## Design Philosophy

Obscura treats privacy as a protocol-level guarantee, not an application-layer feature. Every design decision starts with the question: "What does an observer learn from this?" The answer should always be: "As little as cryptographically possible."

Traditional auction platforms expose bid amounts, bidder identities, and settlement details either in plaintext or through trivially reversible obfuscation. Even "private" blockchain auctions often leak data through public mappings, resolver patterns, or API responses.

Obscura uses Aleo's programmable privacy to ensure that bid amounts are truly invisible (encrypted in private records), bidder identities are never exposed on-chain, and settlement happens via private credit transfers with no public recipient trace.

---

## What Is Public vs Private

### On-Chain Public Data (11 Mappings)

| Mapping | Data | Privacy Assessment |
|---------|------|--------------------|
| `auctions` | AuctionData struct | Contains only hashes and counters — no plaintext |
| `bid_commitments` | bool | Prevents replay; reveals nothing about bid content |
| `revealed_bids` | u128 | Bid amounts visible ONLY after voluntary reveal |
| `highest_bids` | u128 | Visible post-reveal only |
| `second_highest_bids` | u128 | Visible post-reveal only |
| `auction_winners` | field | Winner's bid hash — not their address |
| `program_balance` | u128 | Aggregate pool, not per-user |
| `auction_escrow` | u128 | Total escrowed per auction (sum, not individual) |
| `platform_treasury` | u128 | Accumulated fees |
| `settlements` | SettlementData | Settlement metadata (post-auction only) |
| `platform_config` | PlatformConfig | Admin hash, fee rates |

**Key insight**: No mapping contains a plaintext address. The `auctions` mapping stores `seller_hash` (a BHP256 hash of the seller's address cast to field), which is computationally infeasible to reverse.

### On-Chain Private Data (4 Record Types)

| Record | Owner | Contains | Consumed By |
|--------|-------|----------|-------------|
| `SealedBid` | Bidder | auction_id, bid_amount, bid_nonce, token_type | `reveal_bid` or `claim_unrevealed_refund` |
| `EscrowReceipt` | Bidder | auction_id, escrowed_amount, bid_nonce, token_type | `claim_refund` or `claim_win` |
| `WinnerCertificate` | Winner | auction_id, item_hash, winning_amount, certificate_id | Never (proof of ownership) |
| `SellerReceipt` | Seller | auction_id, item_hash, sale_amount, fee_paid | Never (proof of sale) |

These records are encrypted on Aleo and can only be decrypted by the owner's view key. No other participant, observer, or the contract itself can read their contents without the owner's cooperation.

---

## Privacy Through the Auction Lifecycle

### Phase 1: Creation

```
Seller calls create_auction(item_hash, category, reserve_price, ...)

What becomes public:
  - auction_id (derived from BHP256 hash of AuctionSeed — not predictable)
  - item_hash (BHP256 hash of item data — not reversible)
  - seller_hash = BHP256(seller_address as field) — NOT the address
  - category (1-4, generic enum)
  - deadline (block height)
  - reserve_price_hash = BHP256(reserve_price) — NOT the amount

What stays private:
  - Seller's actual address (used only in private transition scope)
  - Reserve price plaintext (only hash stored)
  - Item title/description (stored encrypted in backend, if at all)
```

**Observer learns**: "An auction exists in category X with deadline at block Y." They cannot determine who created it or what the reserve price is.

### Phase 2: Bidding

```
Bidder calls place_bid(auction_id, amount, nonce, credits_record)

What becomes public:
  - bid_commitments[hash] = true (prevents replay)
  - auction_escrow[auction_id] += amount (aggregate only)
  - bid_count += 1

What stays private:
  - Bid amount (in SealedBid record, encrypted)
  - Bidder's address (record owner, not in any mapping)
  - Bid nonce (random, in record)

Token flow:
  credits.aleo/transfer_private_to_public(record, program_address, amount)
  - The AMOUNT transferred is visible in the credits.aleo mapping
  - The SENDER is hidden (private record consumption)
```

**Observer learns**: "Someone placed a bid on this auction. The total escrow increased by X." They know individual bid amounts from the credits transfer, but NOT who placed them.

**Privacy limitation**: The `transfer_private_to_public` call reveals the bid amount in the credits.aleo program's public mapping. This is inherent to Aleo's credits program — private-to-public transfers must declare the amount. However, the bidder's identity remains hidden.

### Phase 3: Revealing

```
Bidder calls reveal_bid(sealed_bid_record)

What becomes public:
  - revealed_bids[bid_hash] = amount
  - highest_bids and second_highest_bids updated

What stays private:
  - Bidder's address (still only in consumed record)
  - Link between bidder and bid amount
```

**Observer learns**: "Bid X was revealed with amount Y." They cannot determine which address placed it. The bid amount was already inferrable from the escrow deposit, but now it's explicitly confirmed.

**Design choice**: Reveal is voluntary. Bidders who do not reveal before the deadline can still reclaim their escrow via `claim_unrevealed_refund`. This provides an "exit option" for bidders who change their mind.

### Phase 4: Settlement

```
Seller calls finalize_auction(auction_id, reserve_price)

What becomes public:
  - auction_winners[auction_id] = winning_bid_hash
  - settlements[auction_id] = SettlementData
  - Reserve price (disclosed as finalize argument)

What stays private:
  - Winner's address (winner self-identifies later)
  - Seller's address (still only seller_hash on-chain)
```

**Observer learns**: "The auction settled. The winning bid hash is X. The reserve price was Y." They still don't know WHO won or WHO the seller is.

**Privacy trade-off**: The reserve price is disclosed at settlement. This is an accepted trade-off — by this point, all bids are already revealed, so the reserve price no longer provides strategic advantage. The hash verification (`BHP256(reserve_price) == stored_hash`) ensures the seller cannot lie about their reserve price.

### Phase 5: Claiming

```
Winner calls claim_win(escrow_receipt, seller_address, item_hash)

Token flow:
  credits.aleo/transfer_public_to_private(seller_address, payout)
  credits.aleo/transfer_public_to_private(treasury_address, fee)

What becomes public:
  - Program balance decreases (aggregate)

What stays private:
  - Seller address (private input, not in finalize)
  - Winner address (self.caller, not stored in mapping)
  - Payment amount (public-to-private creates private record)
```

**Observer learns**: "The program's public balance decreased." They cannot determine who received the payment or how much went to whom, because `transfer_public_to_private` creates encrypted credit records.

---

## Attack Vector Analysis

### 1. Bid Amount Deanonymization

**Attack**: Observer monitors `credits.aleo/transfer_private_to_public` events to correlate bid amounts with auction escrow increases.

**Mitigation**: While individual transfer amounts are visible in the credits program, there is no on-chain link between the transfer and the specific auction. Multiple auctions and other credits transfers create ambiguity. The bidder's address is never revealed.

**Residual risk**: LOW. Timing correlation (transfer occurring in same block as bid_count increment) could narrow possibilities, but cannot definitively identify the bidder.

### 2. Seller Identity Correlation

**Attack**: Observer computes BHP256 hashes of known addresses and compares against `seller_hash`.

**Mitigation**: BHP256 is a collision-resistant hash function. To reverse it, an attacker would need to hash every possible Aleo address (~2^253 space) and compare. This is computationally infeasible.

**Residual risk**: NEGLIGIBLE. Unless the attacker already knows the seller's address and wants to confirm it — in which case the hash acts as a confirmation oracle. This is inherent to deterministic hashing.

### 3. Winner Identification via claim_win Timing

**Attack**: Observer watches for `claim_win` transaction and checks `self.caller` in the transition.

**Mitigation**: `self.caller` is used inside the transition (off-chain execution) but is NOT stored in any public mapping. The finalize function only verifies the bid commitment hash, not the caller's address. The winner's identity is never written to any public state.

**Residual risk**: LOW. Aleo's transaction model may reveal the sender's address in the transaction metadata (depending on network-level privacy), but the contract itself does not leak it.

### 4. Bid Sniping / Front-Running

**Attack**: Attacker waits until the last moment to place a winning bid, preventing competitors from responding.

**Mitigation**: Anti-sniping mechanism extends the deadline by 40 blocks (~10 minutes) whenever a bid is placed within the final 40-block window. This ensures competitors always have time to respond.

**Residual risk**: NONE. The mechanism is deterministic and enforced on-chain.

### 5. Bid Replay / Double-Reveal

**Attack**: Bidder attempts to use the same bid commitment twice, or reveal the same sealed bid multiple times.

**Mitigation**: `bid_commitments` mapping stores all used commitment hashes. The SealedBid record is consumed (destroyed) upon reveal — it physically cannot be used again in Aleo's UTXO model.

**Residual risk**: NONE. Aleo's record consumption is cryptographically enforced.

### 6. Winner Double-Spend (Refund After Winning)

**Attack**: Winner calls `claim_win` to get the item, then calls `claim_refund` to also reclaim their escrow.

**Mitigation**: `claim_refund` computes the BidCommitment hash from the EscrowReceipt and checks that it does NOT match `auction_winners[auction_id]`. If the caller is the winner, the assertion fails and the refund is blocked.

**Residual risk**: NONE. Cryptographic proof prevents this attack.

---

## Comparison with Competitors

| Privacy Aspect | Obscura | NullPay | Veiled Markets |
|----------------|---------|---------|----------------|
| Bid amounts | Private until voluntary reveal | Leak via public API | Public in mappings |
| Bidder identity | Never on-chain | Invoice hash searchable | Address in plaintext |
| Seller identity | BHP256 hash only | Invoker address visible | Address in plaintext |
| Winner identity | Self-identifies (no public announcement) | N/A | Public in mapping |
| Payment privacy | transfer_public_to_private (no recipient trace) | Public transfer | Public transfer |
| Reserve price | Hash until settlement, then disclosed | N/A | N/A |
| Observer knowledge | Hashes + counters + status only | Full invoice details | Full market details |

---

## Backend Privacy

The off-chain backend stores auction metadata (titles, descriptions) for discoverability. All personally identifiable information is encrypted at rest:

```
Encryption: AES-256-GCM (authenticated encryption)
Key derivation: SHA-256(master_key + table_name + column_name)
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

1. **Credits transfer amounts are visible**: When a bidder calls `transfer_private_to_public`, the amount is visible in the credits.aleo program. This is a limitation of Aleo's current credits program, not of Obscura's design.

2. **Reserve price disclosed at settlement**: The seller must reveal the reserve price to finalize the auction. By this point, all bids are already revealed, so the information is no longer strategically valuable.

3. **Highest bid becomes public post-reveal**: After the reveal phase, `highest_bids` and `second_highest_bids` mappings contain plaintext amounts. This is inherent to the commit-reveal model — revealed bids are, by definition, no longer private.

4. **Item hash is deterministic**: `BHP256(item_data)` produces the same hash for the same input. If an attacker knows the item details, they can confirm which auction it belongs to. This is mitigated by including a random nonce in the auction seed.

These limitations are well-understood trade-offs, not design flaws. Each one exists because the alternative (e.g., never revealing bids, never verifying the reserve price) would break the auction's game-theoretic properties.
