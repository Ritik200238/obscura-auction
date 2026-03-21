# Obscura Auction Monitor Bot

Real-time monitoring for Obscura auctions on Aleo testnet. Tracks Dutch prices, English bids, sealed-bid deadlines, and status changes.

## Setup

```bash
cd bot
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

## Usage

```bash
# Monitor specific auctions
node dist/index.js 1234...field 5678...field

# Or set WATCH_AUCTIONS in .env
WATCH_AUCTIONS=1234...field,5678...field
npm start
```

## What It Monitors

| Auction Mode | Alerts |
|-------------|--------|
| **Dutch** | Current price every cycle, alert when below threshold |
| **English** | New highest bid detected, bid count changes |
| **Sealed/Vickrey** | Deadline approaching (< 100 blocks), deadline passed |
| **All modes** | Status changes, new bids, reveal window closing |

## Output

```
[2026-03-19 14:30:00] INFO  [DUTCH]  1234...field — Current price: 1.2500 ALEO (floor: 0.5)
[2026-03-19 14:30:00] ALERT [DUTCH]  1234...field — Price below threshold! 0.4500 <= 0.5
[2026-03-19 14:30:01] ALERT [ENGLISH] 5678...field — New highest bid: 2.5000 ALEO (was 2.0)
[2026-03-19 14:30:01] WARN  [SEALED] 9abc...field — Deadline in 50 blocks (~12min) | Bids: 3
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NETWORK` | testnet | Aleo network |
| `PROGRAM_ID` | obscura_v4.aleo | Contract program ID |
| `POLL_INTERVAL` | 30000 | Poll interval in ms |
| `DUTCH_PRICE_THRESHOLD` | 0.5 | Alert when Dutch price below this (ALEO) |
| `DEADLINE_WARNING_BLOCKS` | 100 | Alert when deadline within this many blocks |
