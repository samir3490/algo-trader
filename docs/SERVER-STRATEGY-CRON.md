# Server-side strategy runner (runs when logged out)

Paper strategies are executed by **`/api/cron/strategies`** (no login required).

## Vercel Hobby plan

Hobby only allows **one Vercel Cron per day**. This project uses a **daily backup** at ~9:00 IST (`30 3 * * 1-5` UTC).

For **every 15 minutes** during market hours (recommended), use a free external scheduler:

1. Sign up at [cron-job.org](https://cron-job.org) (or similar).
2. Create a job:
   - **URL:** `https://algo-trader-umber.vercel.app/api/cron/strategies`
   - **Schedule:** every 15 minutes, Mon–Fri, 9:00–15:45 IST (adjust to your timezone)
   - **Request header:** `Authorization: Bearer YOUR_CRON_SECRET`
3. Save. The job calls your app even when you are logged out.

Vercel Pro users can use `*/15 * * * *` in `vercel.json` instead.

## Required Vercel environment variables

1. **`CRON_SECRET`** — random string (e.g. `openssl rand -base64 32`). Vercel sends this as `Authorization: Bearer …` when invoking cron jobs.

2. **`FIREBASE_SERVICE_ACCOUNT_JSON`** — full JSON from Firebase Console:
   - Project **agrasen-technologies** → Settings → Service accounts → **Generate new private key**
   - Paste the entire JSON as **one line** in Vercel (no line breaks), or use Vercel’s secret/file upload.

3. **Email** (already used for trade alerts):
   - `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_RECIPIENT`

## After deploying

1. Vercel → Project → Settings → Cron Jobs — confirm `/api/cron/strategies` is listed.
2. Optionally trigger manually:
   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://algo-trader-umber.vercel.app/api/cron/strategies
   ```
3. Ensure strategies are **Running** and mode **Paper** on the Strategies page.

The endpoint itself skips runs when the **NSE market is closed** (9:15–15:30 IST weekdays).
