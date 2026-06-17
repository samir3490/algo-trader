# Paper Trading Runbook

Operational guide for running AlgoTrader paper auto-trading reliably before promoting any strategy to live money.

## Prerequisites

| Requirement | Where to check |
|-------------|----------------|
| Strategies set to **Running** | Strategies page |
| Trading mode = **Paper** (not Live) | Settings |
| `CRON_SECRET` on Vercel | Vercel → Environment Variables |
| `FIREBASE_SERVICE_ACCOUNT_JSON` on Vercel | Vercel env |
| GitHub Actions cron workflow enabled | `.github/workflows/` |
| Email alerts (`EMAIL_USER`, `EMAIL_APP_PASSWORD`) | Vercel env (optional) |

## Schedule

- **Automated scans:** every 15 minutes, Monday–Friday, 9:15 AM–3:30 PM IST
- **Trigger:** GitHub Actions → `GET /api/cron/strategies` with `Authorization: Bearer <CRON_SECRET>`
- **Manual scan:** Strategies page → **Run scan now**

## What each scan does

1. Loads running strategies and scans configured symbols
2. Ranks BUY signals by strength (signal count → alphabetical)
3. Fills open slots up to **max positions** (default 5)
4. Applies **trade gates** (no duplicate buy same day, no same-day rebuy after sell, symbol locks)
5. Uses **live Yahoo quote** for execution price (hint prices >8% off are corrected)
6. Applies **stop-loss / take-profit** risk exits on open holdings
7. Persists paper state, orders, and scan diagnostics to Firestore

SELL strategy signals are **not** used for paper exits — only SL/TP and manual sells close positions.

## Health dashboard

**Dashboard → Paper trading health**

| Signal | Meaning | Action |
|--------|---------|--------|
| Cron stale | No automated run in 25+ min during market hours | Check GitHub Actions logs, `CRON_SECRET`, Vercel deploy |
| Signals but 0 trades | Gates, full slots, or balance | See Strategies → Last scan panel skip reasons |
| Portfolio drift | Holdings ≠ positions | Click **Reconcile** on Dashboard |
| Price corrections | Signal hint diverged from Yahoo | Review symbol data; connect Zerodha for better quotes when trading manually |

Email alerts fire for cron failures, stale cron, zero-trade scans, and price corrections (max once per 15-min window per alert type).

## Reconciliation

When holdings, positions, or trades drift (e.g. after a failed save or legacy data):

1. Open **Dashboard**
2. Click **Reconcile** in the Paper trading health panel
3. Or call `POST /api/paper/reconcile` with Firebase auth token

Reconcile will:

- Prune zero-qty / closed position rows
- Rebuild holdings from open positions
- Dedupe trade history

## Trade gates (summary)

- One BUY per symbol per IST calendar day
- No rebuy same symbol same day after a sell
- One action per symbol per 15-minute window
- Symbol locked for the day after automated sell
- Rebuy cooldown after sell (default 240 min)
- Max concurrent positions (default 5)
- Position sizing ~₹1L per buy (from Settings)

## Backtest vs paper alignment

Paper auto-trading uses the same core rules as backtest when settings match:

- `paperOrderValue` / position sizing
- `simulateBrokerage` and Zerodha charge model
- Stop-loss and take-profit percentages
- Max positions and gates (backtest does not simulate all gates — expect some drift)

Compare per-strategy realized P&L on the Dashboard health panel with backtest results on the Strategies page. Large gaps may indicate overfitting, delayed Yahoo prices, or gate blocks not present in backtest.

## Daily checklist (market days)

- [ ] Dashboard health = **Healthy** (or known warnings only)
- [ ] Last cron within 15–20 minutes during session
- [ ] Paper balance and open positions look correct
- [ ] No unexplained duplicate orders on Orders page
- [ ] Review scan digest email (if enabled)

## Promotion checklist (before live money)

Do **not** enable live auto-trading until:

- [ ] Paper auto-trading stable for **4+ weeks**
- [ ] Reconciliation run with zero errors
- [ ] Backtest and paper P&L directionally aligned per strategy
- [ ] Zerodha connected and margins verified
- [ ] `ENABLE_LIVE_TRADING` and server token storage implemented (Phase 3)
- [ ] Daily loss cap and kill switch tested
- [ ] Start with **reduced size** vs paper

## Reset procedures

| Scenario | Action |
|----------|--------|
| Flat portfolio, wrong balance | Settings → Reset Paper Portfolio |
| Stuck dedupe / locks | Strategies → clear runner state (or Settings) |
| Bad order history | Settings → clear paper orders (optional) |
| Full restart | Reset paper + clear runner state + verify reconcile |

## Troubleshooting

### Cron not running

1. GitHub Actions → workflow run history
2. Vercel logs for `/api/cron/strategies`
3. Verify `CRON_SECRET` matches GitHub secret
4. Redeploy after env changes

### Signals but no trades

See Strategies → **Last strategy scan** panel. Common causes:

- Max positions full
- Paper balance ₹0
- Already bought symbol today
- Sold today — no rebuy until tomorrow
- Strategy in Live mode (email only)

### Wrong execution price

Automated buys always use live Yahoo quote. Check system logs for `execution_price_corrected`. If frequent, consider Zerodha quotes for manual verification.

### Holdings show position but Orders missing SELL

Run **Reconcile**. If persists, check Firestore `users/{uid}/data/paperTrading` vs `orders` collection.

## Related docs

- `docs/SERVER-STRATEGY-CRON.md` — cron setup
- Dashboard → Paper trading health — live status
- Strategies → Last scan panel — scan diagnostics
