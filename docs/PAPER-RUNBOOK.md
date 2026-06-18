# Paper Trading Runbook

Operational guide for running AlgoTrader paper auto-trading reliably, plus the full product roadmap from paper → live.

---

## Algo trading roadmap

High-level plan for AlgoTrader. **Do not skip ahead to live money** until Phase 1 is stable and Phase 3 prerequisites are met.

| Phase | Goal | Timeline | Status |
|-------|------|----------|--------|
| **1** | Stabilize & trust paper auto-trading | 2–4 weeks | **Mostly shipped** |
| **2** | Smarter entries & exits (paper only) | 3–5 weeks | **Shipped** |
| **3** | Live trading automation (real money) | 4–8 weeks | Not started |
| **4** | Analytics & optimization | Ongoing | Done |
| **5** | Product & ops polish | Ongoing | Partial (mobile UI, audit & compliance) |

**Suggested order:** Phase 1 → Phase 2.1–2.3 → 4+ weeks stable paper → Phase 3 → Phase 4 in parallel.

### Where you are today

| Area | Status |
|------|--------|
| Paper auto-trading (15-min cron) | Working |
| 12 universe strategies (Nifty 50), cross-strategy strength ranking | Working |
| Portfolio gates (no duplicate buy, no same-day rebuy) | Working |
| Risk exits (SL/TP), brokerage simulation | Working |
| Backtest on Strategies page | Working |
| Live Zerodha (manual orders) | Working |
| Live auto from cron | **Email only** — no server-side orders |
| Market data for cron | Yahoo (~15 min delayed) |
| Strategy SELL signals | **Enabled** — two-phase scan with min-hold |
| Universe scan | **Enabled** — 12 scanners (one per strategy type) on full Nifty 50 |
| Volatility sizing | **Enabled** — ₹ / % balance / ATR-risk |
| Trailing stop & time exits | **Enabled** — Settings → Risk |
| Auto-pause strategies | **Enabled** — optional, Settings → Risk |

---

### Phase 1 — Stabilize & trust (2–4 weeks)

**Goal:** Run paper auto-trading for weeks without surprises.

- [x] Paper trading health dashboard (**Dashboard → Paper trading health**)
- [x] Cron / scan health email alerts (failures, stale cron, zero trades, price corrections)
- [x] Price correction tracking in scan diagnostics
- [ ] Zerodha quotes preferred in cron when connected (Yahoo still used for automated scans)
- [x] Portfolio reconciliation (drift detection + **Reconcile** button + API)
- [x] Paper runbook (this document)
- [x] Per-strategy paper P&L on Dashboard (compare with Strategies backtest)

**Ops sections below** (schedule, health dashboard, reconciliation, daily checklist) support Phase 1.

---

### Phase 2 — Smarter entries & exits (3–5 weeks)

**Goal:** Better signals and exits — still **paper only**.

- [x] **Universe scanning** — one instance per strategy type scans full Nifty 50; portfolio layer ranks all BUYs by **signal count** (same symbol from multiple strategies ranks higher) then combined confidence; fills only **open position slots** (`maxPositions − open holdings`)
- [x] **Volatility-based sizing** — Settings → Paper: fixed ₹, % of balance, or ATR-risk
- [x] **Trailing stop-loss** — Settings → Risk: trail % from peak since entry
- [x] **Time-based exits** — max hold days, square-off before 3:15 PM for MIS, optional “no progress in X days”
- [x] **Strategy performance loop** — win rate & avg hold on Paper Trading; auto-pause losing instances
- [x] **Optional strategy SELL signals** — after min-hold and min profit % (default 5%); combined sell weight; weak single-signal sells ignored (default 2 strategies). No fixed auto-exit at 5% unless Auto Take Profit is on. Trailing stop arms after min profit and ratchets from peak. Stop loss (2%) on losses. Time exits unchanged.

---

### Phase 3 — Live trading automation (4–8 weeks)

**Goal:** Same automation as paper, but with **real money** — safely.

- [ ] **Server-side Zerodha tokens** — encrypted refresh tokens in Firestore so cron can place live orders (today Live mode = email alert only)
- [ ] **Live execution path** — mirror `run-server.ts` paper path for live via Kite API
- [ ] **Hard failsafes** — `ENABLE_LIVE_TRADING`, max daily loss, max order value, max positions
- [ ] **Paper → live promotion** — strategy must run in paper X days with minimum metrics; explicit “Go live” with smaller size cap
- [ ] **Order lifecycle** — market vs limit, slippage tracking, partial fills, rejections, retries
- [ ] **Pre-market checks** — token valid, margin sufficient, market open, no stale quotes

**Gate:** Only after **4–8 weeks** of stable paper auto-trading (see Promotion checklist below).

---

### Phase 4 — Analytics & optimization (ongoing)

**Goal:** Know what works before scaling capital.

- [x] **Portfolio analytics** — Sharpe, max drawdown, profit factor, by strategy / symbol / month
- [x] **Walk-forward / out-of-sample backtest** — e.g. train on 2023, test on 2024
- [x] **Parameter tuning** — grid search RSI period, MA lengths per symbol (with overfitting warnings)
- [x] **Trade journal** — why each trade happened (signal, strength, gate passed); CSV export
- [x] **Benchmark** — paper P&L vs Nifty 50 buy-and-hold on same dates

Can run in parallel once you have enough paper trade history.

---

### Phase 5 — Product & ops polish (ongoing)

**Goal:** Production-grade UX and operations.

- [ ] **Telegram bot** — buys, sells, risk exits, cron failures (email exists today)
- [x] **Mobile-friendly UI** — bottom nav, responsive cards on orders/audit/analytics
- [ ] **Multi-account** — separate paper portfolios or tags per strategy bundle
- [ ] **PostgreSQL cache** — faster backtests, historical candle store (`DATABASE_URL` optional)
- [x] **Audit & compliance** — trade audit trail + CSV, daily P&L email, MIS square-off cron (15:15 IST)

---

### Risks to keep in mind

- Yahoo-delayed prices can cause bad fills — monitor price corrections on Dashboard
- Backtest win rates are not guarantees (overfitting)
- Live auto needs token security, margin checks, and a kill switch
- Vercel Hobby limits cron; GitHub Actions is fine for 15-min scans

---

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

1. Runs each **universe strategy** (12 types) against the full symbol list (Nifty 50)
2. Collects all BUY signals into one ranked list: **signal count** (how many strategies flagged the symbol) → **combined confidence** → symbol name
3. Buys only as many symbols as **open slots** allow (`maxPositions` default 5 minus current holdings)
4. Applies **trade gates** (no duplicate buy same day, no same-day rebuy after sell, symbol locks)
5. Uses **live Yahoo quote** for execution price (hint prices >8% off are corrected)
6. Applies **stop-loss / take-profit**, optional **trailing stop**, and **time-based exits** on open holdings
7. Optional **strategy SELL signals** (two-phase scan after min hold) when enabled in Settings → Risk
8. Persists paper state, orders, and scan diagnostics to Firestore

### Migrate from per-symbol strategies

If you still have hundreds of per-symbol rows (legacy setup):

1. Deploy latest app
2. **Strategies → Universe scan (Nifty 50)** — confirms, then replaces all strategies with 12 universe scanners and merges Phase 2 settings into Firestore
3. Verify **12 running** strategies and Settings show Phase 2 defaults (10% position size, trailing stop, strategy sells on)


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
