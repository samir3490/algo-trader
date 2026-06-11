# Server-side strategy runner (runs when logged out)

Paper strategies run via **`GET /api/cron/strategies`** with header:

`Authorization: Bearer YOUR_CRON_SECRET`

The job:

1. Refreshes paper holding prices (Yahoo)
2. Applies **stop-loss / take-profit** from Settings
3. Scans all **running** strategies and places **paper** BUY/SELL
4. Sends email alerts (if configured)

## Vercel Cron: Hobby vs Pro (important)

| Plan | Built-in Vercel Cron | Minimum interval |
|------|----------------------|------------------|
| **Hobby** | Yes, but **once per day only** | 1× per day (deploy **fails** if you use `*/15`) |
| **Pro** | Yes | **Once per minute** (e.g. every 15 min) |

Hobby and Pro are **not** the same for Vercel’s native cron. A `*/15` schedule in `vercel.json` will **reject deployment** on Hobby.

Official docs: [Vercel Cron pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Every 15 minutes on Hobby (recommended)

Use **GitHub Actions** (free) — already in this repo:

**File:** `.github/workflows/strategy-cron.yml`  
**Schedule:** `*/15` UTC hours 4–10, Monday–Friday (~9:30–15:45 IST)

**Vercel Hobby backup:** once per weekday at 12:00 IST (`30 6 * * 1-5` in `vercel.json`)

### One-time setup

1. **Vercel** → algo-trader → **Settings** → **Environment Variables**
   - Name: `CRON_SECRET` — paste the generated value (no quotes)
   - Enable **Production** (and Preview if you use preview URLs)
   - **Save**, then **Deployments** → latest → **⋯** → **Redeploy** (required — env vars are not applied to old builds)
2. **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions**
   - **New repository secret:** `CRON_SECRET` = **exact same** value as Vercel (no trailing newline)
3. Optional **Variable:** `APP_URL` = `https://algo-trader-umber.vercel.app`
4. **Actions** → **Strategy scan (15 min)** → **Run workflow**

**401 Unauthorized?** Usually one of:
- Vercel `CRON_SECRET` not checked for **Production**
- Forgot to **Redeploy** after adding the variable on Vercel
- GitHub and Vercel values differ (re-copy from one source into both)

**503 not configured?** `CRON_SECRET` is missing on the live Vercel deployment — add it and redeploy.

Manual test: **Actions** → **Strategy scan (15 min)** → **Run workflow**

## Every 15 minutes on Vercel Pro

Copy `vercel.pro.json` over `vercel.json` (or merge the `crons` block), then redeploy:

```json
"schedule": "*/15 4-10 * * 1-5"
```

If you use both GitHub Actions and Vercel Pro cron with the same schedule, scans run **twice** — disable one of them.

## Alternative: cron-job.org

Create a job:

- URL: `https://YOUR_APP.vercel.app/api/cron/strategies`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- Every **15 minutes**, weekdays, IST morning–afternoon

## Required Vercel environment variables

1. **`CRON_SECRET`** — `openssl rand -base64 32` (paste output, not the command)
2. **`FIREBASE_SERVICE_ACCOUNT_JSON`**
3. **Email:** `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_RECIPIENT`
4. **Live orders (optional):** `ZERODHA_PROXY_URL`, `ZERODHA_PROXY_SECRET`

## Paper vs live from cron

| Mode | Cron behaviour |
|------|----------------|
| **Paper** | Full auto BUY/SELL + risk exits |
| **Live** | **Signal email only** — Zerodha tokens are in browser cookies; cron cannot place live orders yet. Use Live Trading tab or we can add server-stored tokens later. |

## Dedupe (intraday)

At most **one BUY and one SELL per symbol per 15-minute window** (IST), so repeated cron runs do not spam duplicate orders.

## Verify

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://algo-trader-umber.vercel.app/api/cron/strategies
```

- `401` — wrong secret  
- `skipped: Market closed` — outside 9:15–15:30 IST  
- `usersProcessed` / `totalTrades` — success  

Strategies must be **Running** on the Strategies page (Paper mode for auto trades).
