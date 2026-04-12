# OBSCURA — WAVE 5 MASTER PLAN

> **Final wave. Must get grant. This doc is our bible.**

Buildathon: Aleo Privacy Buildathon Wave 5
Deadline: TBD (confirm)
Target: Top 5 placement, grant award
Date drafted: 2026-04-12

---

## 0. EXECUTIVE SUMMARY

Wave 3 = 34pts ($0). Wave 4 = 30pts ($0). Wave 5 target = **43+ pts** to secure grant.

**Root cause Wave 4 lost**: PROGRAM_ID bug — frontend called `obscura_v5.aleo` which did not exist. Every TX failed. Judge scored what he could test → UX 5, Privacy 6.

**NEW finding (2026-04-12)**: Same disaster still active. README + memory claimed `obscura_core_v4`, `obscura_settle_stable_v3`, `obscura_market_v2` deployed. Explorer check showed only `obscura_v3`, `obscura_core_v3`, `obscura_settle_v3` actually exist on testnet. Frontend likely pointing to non-existent programs.

**This is Rule 0.** Fix before ANY feature work ships.

---

## 1. SCORING TARGET (Wave 4 → Wave 5)

| Category | Weight | W4 Score | W5 Target | Gain | Effort |
|----------|--------|----------|-----------|------|--------|
| Privacy | 40% | 6 | **9** | +3 | High |
| Technical | 20% | 7 | **9** | +2 | Medium |
| UX | 20% | 5 | **8** | +3 | High |
| Practicality | 10% | 6 | **8** | +2 | Medium |
| Novelty | 10% | 6 | **8** | +2 | Low |
| **Total** | 100% | **30** | **42** | **+12** | — |

Grant floor Wave 4 ~40 pts. Top-3 grants 41-42 pts. Target 42+ for safe top 5.

---

## 2. CURRENT DEPLOYED STATE (VERIFIED)

| Program | On-chain? | Notes |
|---------|-----------|-------|
| `obscura_v3.aleo` | ✅ HTTP 200 | Wave 3 original |
| `obscura_core_v3.aleo` | ✅ HTTP 200 | Wave 3/4 core |
| `obscura_settle_v3.aleo` | ✅ HTTP 200 | ALEO settlement |
| `obscura_core_v4.aleo` | ❌ 404 | Built locally, never deployed |
| `obscura_settle_stable_v3.aleo` | ❓ | Must verify |
| `obscura_market_v2.aleo` | ❓ | Must verify |
| `obscura_settle_v4.aleo` | 🚧 deploying | Privacy-hardened (this wave) |
| `obscura_settle_stable_v4.aleo` | 🚧 pending | Will redeploy with v3 core import |

**Deployer balance (2026-04-12)**: 48.62 ALEO

---

## 3. PRIVACY LAYER (40% weight — biggest lever)

### 3.1 Tier 1 — Already built in settle_v4 this wave

- **`revealed_bids` mapping**: `field => u128` → `field => bool`. Bid amounts no longer stored plaintext. Amount is cryptographically committed in `bid_hash = BHP256(bidder, auction_id, amount, nonce)`. Mapping only records "was revealed."
- **Apply same fix to `obscura_settle_stable_v4`** (USDCx/USAD). In progress.

### 3.2 Tier 2 — Contract redeploys needed

**obscura_core_v4 refactor**: Move these from finalize to transition circuit:
- `reserve_price` plaintext comparison → `reserve_hash` comparison (already partial)
- `highest_bids`, `second_highest_bids`, `lowest_bids`, `multi_unit_highest`, `multi_unit_second`, `escalation_prices` — store hash commitments or delete post-settle
- `reputation_completed` / `reputation_disputed` — delete after each auction or aggregate only periodically
- `revealed_results` plaintext u128 → commitment

**Merkle allowlist upgrade**: 16 → 20 levels. Supports 1M+ addresses. Gate every auction by default.

### 3.3 Tier 3 — New records (novelty + privacy)

- **`PrivacyReceipt` record** — non-transferable, non-consumable "I bid on auction X" proof. No amount, no outcome. Usable for airdrops, reputation without leak.
- **`AnonymousCredential` record** — proves holder is KYC'd / accredited / DAO member without revealing which. Auction gates on credential type.
- **Seller pseudonym with salt** — `BHP256(address + auction_id + random_salt)`. Unlinkable across auctions.

### 3.4 Tier 4 — Post-settlement cleanup

After `finalize_auction` / `settle_*` completes:
- `Mapping::remove()` entries for `highest_bids`, `second_highest_bids`, `revealed_bids`, `escalation_prices`, `multi_unit_*`
- Only `settlement_proofs` hash remains
- Time-delayed result disclosure: winning price hidden for N blocks post-settle

### 3.5 Privacy visibility for judge

- **`PRIVACY.md` per-transition table** — every transition lists inputs (public/private), mapping reads/writes, exposure
- **In-app privacy notices** — on every action panel: "What's private / What's public / Why"
- **Privacy score badges** — visible on `/browse`: "🔒 Privacy Score: 9/10"
- **Interactive privacy visualizer** — hover-to-reveal data flow diagram per phase

### 3.6 Honest limitations (transparency = judge points)

- `credits.aleo::transfer_private_to_public` exposes amount on credits.aleo ledger (Aleo platform constraint)
- USDCx/USAD use public transfer (stablecoin compliance model on Aleo)
- Running max needs plaintext comparison during reveal window (deleted post-settle)

---

## 4. TECHNICAL IMPLEMENTATION (20% weight)

### 4.1 Ecosystem packages (match NullPay)

- **`@obscura/sdk`** — TypeScript client, publish to npm
- **`@obscura/cli`** — command-line tool (create, bid, settle), publish to npm
- **`@obscura/mcp`** — MCP server for AI agents (Claude Desktop, etc.), publish to npm. FIRST auction protocol with AI-agent integration.
- **`@obscura/bot`** — auto-settle expired auctions, deploy to Render 24/7

### 4.2 Multi-program CPI architecture

Current: 3 programs (v3). Target 5-6 programs:
- `obscura_core_v3.aleo` (keep, it's deployed)
- `obscura_settle_v4.aleo` (NEW — privacy-hardened ALEO settle)
- `obscura_settle_stable_v4.aleo` (NEW — privacy-hardened USDCx/USAD)
- `obscura_market_v3.aleo` (verify + potentially redeploy)
- `obscura_gate_v1.aleo` (NEW — Merkle allowlists + credential verification)
- `obscura_rep_v1.aleo` (NEW — reputation records) [optional]

### 4.3 Production infrastructure

- **Chain indexer** — PostgreSQL + Drizzle, polls blocks, indexes auction events
- **REST API** — auction state, bid history, status
- **IPFS via Pinata** — auction images, descriptions, logos
- **Monitoring** — Sentry (errors), UptimeRobot (availability)
- **Analytics** — Plausible (privacy-respecting)

### 4.4 Testing

- **Integration tests** — real testnet transactions in CI
- **E2E tests** — Shield Wallet flow with Playwright
- **SDK unit tests** — every exported function
- **Contract tests** — Leo test suite (not stubs)

### 4.5 Deployment discipline

- README deployment log table with TX hashes + block heights + dates
- `./verify.sh` script automating Rule 0 checklist
- All warnings documented, not hidden

### 4.6 Documentation

- **Whitepaper PDF** — abstract, threat model, protocol spec, privacy proofs, game theory
- **Developer docs subdomain** (or `/docs`) — SDK ref, CLI ref, MCP guide, contract API
- **In-app `/docs` page** — 8 user-facing sections with Leo snippets

---

## 5. UX / UI LAYER (20% weight — the SILENT KILLER)

Wave 3 UX = 5. Wave 4 UX = 5. Pattern = judge cannot use product. Must break this cycle.

### 5.1 Design system (lock in)

**Color palette** (recommended: dark premium with electric accent):
- Base: Deep slate `#0B0F1A` / `#121826`
- Surface: `#1A2332` with subtle gradient
- Primary accent: Electric purple `#7C3AED`
- Secondary accent: Cyan `#06B6D4`
- Success: `#10B981` | Warning: `#F59E0B` | Error: `#EF4444`
- Text primary: `#F8FAFC`  | Text secondary: `#94A3B8`

**Typography**:
- Headings: Satoshi (700/500)
- Body: Inter (400/500)
- Mono: JetBrains Mono (for addresses, hashes)

**Components**: Standardize on shadcn/ui + Radix primitives. Remove custom duplicates.

**Motion**: Framer Motion. Every state change animated. No snap transitions.

### 5.2 Alpaca-inspired patterns (ADOPT)

Studied Alpaca Invoice. Key lessons for Obscura:

- **Dedicated page per complex flow**. Instead of inline forms on `/browse`, send user to `/create`, `/bid/[id]`, `/reveal/[id]`, `/claim/[id]`. Keeps each page focused.
- **Progressive disclosure**. Advanced options hidden behind "Advanced" toggle. Sensible defaults.
- **Card-based organization** on list views. Status badges, essential info, action CTA per card.
- **Multi-phase progress indicators**. "Phase 1-3" style: Token prep → Proving → Finalizing.
- **Selective detail reveal**. Hashes, addresses hidden behind "View details" toggle — not cluttering the card.
- **Large hero with clear CTA**. "Start Private Auction" equivalent of their "Start Private Settlement."
- **Generous whitespace**. Avoid cramming 10 data points per screen.
- **Comparison table**. "Legacy auctions vs Public chains vs Obscura" — show unfair advantage.

### 5.3 Page-by-page plan

| Route | Purpose | Key elements |
|-------|---------|--------------|
| `/` Landing | Convert visitor in 30s | Hero, 10 formats showcase, comparison table, live stats, CTA |
| `/browse` | Discover live auctions | Filter by format/token/status, grid of cards, countdown per card |
| `/create` | Launch auction (dedicated page) | 8-step wizard, templates, localStorage draft, preview |
| `/auction/[id]` | Bid/reveal/settle (dedicated page) | Phase-aware panels, countdown, privacy notices, bid history |
| `/bid/[id]` | Place bid (dedicated page) | Amount input, privacy explainer, progress bar |
| `/reveal/[id]` | Reveal bid (dedicated page) | Consume SealedBid record, escrow tokens, progress bar |
| `/claim/[id]` | Claim win/refund (dedicated page) | Winner cert generation, refund path |
| `/portfolio` | User's activity | My Bids / My Wins / My Auctions tabs |
| `/proof` | Generate ZK winning proof | Input auction, generate proof, shareable card |
| `/explorer` | Analytics dashboard | Charts, stats, privacy scores |
| `/docs` | Technical docs | 8 sections with code snippets |
| `/for-daos` | DAO use case | Treasury flows + case study |
| `/for-artists` | NFT drops | Dutch walkthrough |
| `/for-procurement` | Reverse auctions | RFP flow |
| `/for-developers` | SDK + integrations | Examples |
| `/faucet` | Testnet tokens | One-click with wallet |

### 5.4 Onboarding

- **First-visit tour** — 5 slides: What is Obscura → Connect wallet → Get testnet ALEO → Create or Browse → Place your first bid
- **Empty state handling** — no auctions? "Create first" CTA. No bids? "Browse" CTA.
- **Progressive disclosure** — Merkle allowlist, credential gating hidden behind "Advanced"

### 5.5 Transaction UX

Every TX visibly goes through:
```
Idle → Signing → Proof generating (15s of ~45s) → Broadcasting → Pending (block 15733XXX) → Confirmed ✓
```

- **Progress bar** with time estimate (historical avg)
- **Success state** — confetti + "View on Explorer" + "What's next"
- **Error state** — never raw errors. Diagnose + recovery action:
  - Insufficient balance → [Open Faucet]
  - Wallet rejected → [Try Again]
  - Expired → [View other auctions]
  - Proof failed → [Retry] + debug toggle

### 5.6 Mobile

Every page responsive at 375px. Touch-friendly (44px tap target). Hamburger nav. Swipeable tabs.

### 5.7 Faucet & Help

- Faucet icon in top nav on EVERY page
- `?` icons on every complex UI element
- Glossary page for terms

### 5.8 Premium touches

- Dark mode primary (premium feel)
- Skeleton screens during load (not spinners)
- Subtle micro-animations on hover
- Glass-morphism cards on landing (like Veil Strike)
- Custom illustrations for 10 auction formats

---

## 6. PRACTICALITY (10% weight)

Wave 4 = 6. "Auctions are niche" killed it. Reposition.

### 6.1 Repositioning

Drop: "auction protocol"
Use: **"Private Capital Formation Infrastructure"**

Landing hero:
> **Launch tokens. Sell NFTs. Run procurement. All private by default.**
> The auction infrastructure for when privacy matters.

### 6.2 Use-case pages (4 dedicated pages)

- `/for-daos` — DAO treasury liquidation, private fundraising
- `/for-artists` — NFT drops, fair pricing (Dutch/English)
- `/for-procurement` — RFPs, reverse auctions, compliance
- `/for-developers` — SDK, CLI, MCP, integration examples

Each: real scenario → walkthrough → "Create one now" CTA.

### 6.3 Live case studies (seed during judging window)

3 visible case studies with real TX hashes:
1. "Aleo Dev DAO sells testnet NFTs via Vickrey — cleared at 500 ALEO"
2. "Token launch via Dutch auction — starts 1000, sells 450"
3. "Private consulting RFP via Reverse — 3 bidders, lowest wins"

### 6.4 Populated marketplace

Seed 15+ live auctions across 10 formats during judging window. Get 2-3 friends to bid. Show real activity on `/browse`.

### 6.5 Mainnet roadmap (visible)

3-phase plan:
1. **Testnet** (now) — all 10 formats, free to use
2. **Mainnet Beta** (post-buildathon) — invite-only, real tokens
3. **Mainnet GA** — open access, fee-supported, DAO-governed

### 6.6 Business model

- 1% platform fee on cleared volume
- Fee routing: 60% treasury, 30% closer rewards, 10% referrers
- Documented on `/business` page

### 6.7 Partnerships (reach out during Week 4)

- NullPay — payments for won auctions
- 1 Aleo NFT project — run their drop on Obscura
- ZKPerp — hedging post-auction exposure

---

## 7. NOVELTY / CREATIVITY (10% weight)

Wave 4 = 6. You have the most novel auction primitives on Aleo. Make them VISIBLE.

### 7.1 Headline novelties (pick 2 as centerpiece)

1. **Combinatorial subset bidding** — judge explicitly asked for this Wave 3. Already have `place_subset_bid` (line 839 of core). Build:
   - 4-item bundle auction UI
   - Interactive bitmask selector (checkboxes for each item)
   - Visualization of allocation math (seller picks max-revenue)
   - ZK-proof that no items overlap across winners

2. **`prove_won_auction` selective disclosure** — dedicated `/proof` page. Winner generates ZK proof of winning without revealing amount. Shareable card. Usable as lending collateral.

### 7.2 Novel UI patterns

- **Privacy visualizer** — interactive diagram showing data flow. Hover "bid" → see what's private (amount, identity) vs public (auction exists, deadline).
- **Auction cascade builder** — compose: Vickrey (floor) → English (above floor). Visualize chain. Deploy both in one wizard.
- **ZK proof cards** — winner generates shareable image/card. Post to X. On-click verification.

### 7.3 Already-built novelty to highlight

- **Vickrey** — first on Aleo. Badge it.
- **Candle auctions** — random end block. Animate clock.
- **Blind Dutch** — unique to Obscura. Dedicated explainer page.
- **Reverse auctions** — procurement use case.

---

## 8. EXECUTION SEQUENCE (4-week plan)

### Week 1 — Privacy foundation + deployment verification
- [x] Audit finalize blocks in obscura_core_v4 (done 2026-04-12)
- [x] Build obscura_settle_v4 with privacy fix (done)
- [ ] Deploy obscura_settle_v4 to testnet (in progress)
- [ ] Apply same fix to obscura_settle_stable → v4
- [ ] Verify ALL deployed programs via explorer API (Rule 0)
- [ ] Fix frontend PROGRAM_IDs to match reality
- [ ] Audit obscura_settle + obscura_settle_stable + obscura_market finalize leaks
- [ ] Plan obscura_core_v4 redeploy if budget allows

### Week 2 — Ecosystem + Infrastructure
- [ ] Publish `@obscura/sdk` to npm
- [ ] Publish `@obscura/cli` to npm
- [ ] Build `@obscura/mcp` server and publish
- [ ] Deploy bot to Render (auto-settle cron)
- [ ] Build PostgreSQL indexer
- [ ] IPFS integration via Pinata
- [ ] Integration test suite

### Week 3 — UX overhaul (THE KILLER WEEK)
- [ ] Design system lock-in (colors, typography, components)
- [ ] Landing page redesign (Alpaca-inspired)
- [ ] Split `/browse` into grid cards, no inline forms
- [ ] Move actions to dedicated pages: `/create`, `/bid/[id]`, `/reveal/[id]`, `/claim/[id]`
- [ ] Transaction UX: progress bars, success states, error recovery
- [ ] Mobile 375px pass
- [ ] Onboarding tour
- [ ] Seed 15+ demo auctions across 10 formats
- [ ] Empty state design for every page
- [ ] Privacy visualizer component
- [ ] Combinatorial bidding UI (headline novelty)
- [ ] ZK proof card generator

### Week 4 — Polish + Submit
- [ ] Use-case pages (`/for-daos`, `/for-artists`, `/for-procurement`, `/for-developers`)
- [ ] Case studies with real TXs
- [ ] Whitepaper PDF
- [ ] Demo video (2-3 min)
- [ ] Partnership outreach
- [ ] Run Rule 0 verification script
- [ ] Fix ALL warnings before submit
- [ ] README deployment log table
- [ ] Submit 48h before deadline

---

## 9. RULE 0 — PRE-SUBMISSION GATES (NON-NEGOTIABLE)

Automated checklist. Any failure = do not submit.

```
☐ All PROGRAM_IDs in frontend/src/types/index.ts exist on explorer
☐ All PROGRAM_IDs in frontend/src/lib/config.ts exist on explorer
☐ All PROGRAM_IDs in frontend/src/components/layout/Footer.tsx exist on explorer
☐ All PROGRAM_IDs in sdk/src/constants.ts exist on explorer
☐ All PROGRAM_IDs in backend/src/explorer.ts exist on explorer
☐ grep -r "obscura_v5\|obscura_core_v4\|obscura_settle_v3" --include="*.tsx" --include="*.ts" --include="*.md" | grep -v deployed-log.md returns zero unless those programs exist on-chain
☐ curl each PROGRAM_ID → HTTP 200 with source
☐ Connect Shield Wallet → every nav link → every TX → success
☐ 15+ seeded auctions visible on /browse
☐ Mobile 375px every page
☐ SDK installable: `npm install @obscura/sdk` works
☐ Bot running on Render (uptime check HTTP 200)
☐ README stats match deployed bytecode
☐ Faucet link visible on every page
☐ No references to undeployed programs in docs
```

---

## 10. SUCCESS METRICS

### Before submission
- Privacy score calculated per transition in PRIVACY.md
- 15+ live auctions seeded, with real bids
- SDK downloaded 10+ times from npm
- Bot uptime 98%+ for 7 days straight
- Lighthouse score 90+ on landing page
- Mobile responsive test passes at 375px
- Rule 0 checklist 100% green

### Judge test simulation (run before submit)
Give a friend who has never seen Obscura:
1. URL + wallet install instructions
2. Timer: 10 minutes
3. Task: Create auction → Place bid → Reveal → Claim win

Expected: completes without your help. If not, fix friction, retry.

### Post-submission expectation
- Privacy 9 (from finalize-min + honest PRIVACY.md + visible notices)
- Tech 9 (from SDK + CLI + MCP + bot + tests + indexer)
- UX 8 (from Alpaca-inspired dedicated pages + populated demo)
- Practicality 8 (from repositioning + case studies + running infra)
- Novelty 8 (from combinatorial + ZK proof lending primitive)
- Total 42-43 pts → top 5 grant

---

## 11. OPEN DECISIONS (CONFIRM BEFORE WEEK 1 STARTS)

1. **Wave 5 deadline** — when exactly?
2. **obscura_core_v4 redeploy** — yes (full score) or no (accept current core_v3)?
3. **MCP server** — include (NullPay-match play) or skip (save time)?
4. **Partnerships outreach** — willing or skip?
5. **Mainnet intent** — signal it or testnet-only framing?
6. **Visual direction** — dark premium (recommended) vs other?
7. **Novelty centerpiece** — Combinatorial + ZK proof lending (recommended) vs alternatives?
8. **Team** — solo or collaborator handling subset of work?

---

## 12. APPENDIX

### A. Wave 4 judge comment (verbatim)
> "Consider adding more auction types (English, combinatorial). The 250KB+ of Leo code across 4 contract variants with real deployment debugging ('snarkVM 31-limit compliance', 'Trim to 28 transitions') is exceptionally deep. Polish the frontend UX to match the contract quality."

### B. Top Wave 4 grant winners (benchmark)
| Project | Score | Grant | Winning edge |
|---------|-------|-------|--------------|
| NullPay | 38 | $2700 | MCP + SDK + CLI, "most complete" |
| Fairdrop | 41 | $1800 | 9-program CPI, Merkle 20, ZK referrals |
| Veiled Markets | 42 | $900 | Multi-voter quorum, production UX |
| ZKPerp | 42 | $900 | Finalize hash-only = max privacy |
| PrivaDex | 42 | $900 | 10-contract DEX ecosystem |

### C. Competitor features NOT to copy
- NullPay gift cards (doesn't map to auctions)
- ZKPerp slot-based records (perpetual-specific)
- Fairdrop LBP/Quadratic (empty scaffolds — judge called them out)
- Alpaca i18n (low leverage for judge time)

### D. Alpaca UX patterns TO adopt
- Dedicated pages per complex flow (not modals for multi-step)
- Progressive disclosure (Advanced toggle)
- Card-based list views with status badges
- Multi-phase progress indicators ("Phase 1-3")
- Selective detail reveal (hashes hidden by default)
- Comparison table on landing
- Generous whitespace

### E. Memory rules (enforced across sessions)
- No Claude attribution in commits/code/docs
- Caveman-brevity default style
- Verify program existence on explorer BEFORE deploy (new rule added 2026-04-12)

---

**Document owner**: Ritik
**Last updated**: 2026-04-12
**Status**: Draft — awaiting confirmation on open decisions in §11
