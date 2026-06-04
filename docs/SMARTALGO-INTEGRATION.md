# SmartAlgo PRD → AlgoTrader integration

Gemini’s PRD describes a **Python FastAPI + PostgreSQL** stack. We **did not** add that parallel backend — it would duplicate Zerodha OAuth, Firebase user state, and the live Next.js app.

Instead, equivalent capabilities live in **TypeScript** under `src/lib/`, wired to existing Firebase + Kite Connect flows.

## Adopted in this repo

| PRD concept | AlgoTrader location |
|-------------|---------------------|
| Market data cache → DB → Yahoo | `src/lib/services/market-data-service.ts` |
| Backtest (no look-ahead, charges, slippage) | `src/lib/backtest/engine.ts` |
| Base strategy + structured signals | `src/lib/strategies/base-strategy.ts`, `structured-signal.ts` |
| MA crossover / RSI mean reversion | Existing `smaCrossover` + `rsi-mean-reversion.ts` |
| Risk engine (daily loss, positions, 3 PM cutoff) | `src/lib/risk/smart-risk-engine.ts` |
| Paper flow unchanged | `execute-paper.ts`, `portfolio-gate.ts`, Firestore |
| Live trading failsafe | `ENABLE_LIVE_TRADING` + `live-trading-guard.ts` on Zerodha POST |
| System audit logs | `src/lib/core/system-log.ts` + `GET /api/system/logs` |
| Optional Postgres candles/backtests | `prisma/schema.prisma` (when `DATABASE_URL` is set) |

## Unchanged (by design)

- **Firebase** — paper portfolio, settings, strategies, Zerodha account metadata
- **Zerodha** — login/callback/cookies; live orders only if `ENABLE_LIVE_TRADING=true`
- **GitHub Actions** — 15-minute strategy cron
- **UI shell** — existing React pages; backtest panel added on Strategies page

## Optional: enable Postgres cache

1. Set `DATABASE_URL` on Vercel
2. Run `npx prisma migrate deploy`
3. Candles/backtest rows will persist; without DB, in-memory + Yahoo still work
