# Server-side strategy runner (runs when logged out)

Paper strategies are executed by a **Vercel Cron** job every 15 minutes (`/api/cron/strategies`).

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

Cron runs only on **weekdays during NSE market hours** (9:15–15:30 IST).
