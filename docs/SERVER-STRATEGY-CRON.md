# Server-side strategy runner (runs when logged out)

Paper strategies are executed by **`/api/cron/strategies`** (no login required).

## Vercel Hobby plan — once per day

Hobby allows **one cron job per day**. This project uses:

- **Schedule:** `30 3 * * 1-5` (about **9:00 AM IST**, Monday–Friday)
- **Path:** `/api/cron/strategies`

Vercel invokes the job automatically; you do not need to keep the app open.

For more frequent scans, upgrade to **Vercel Pro** or trigger **Run scan now** on the Strategies page while logged in.

## Required Vercel environment variables

1. **`CRON_SECRET`** — run `openssl rand -base64 32` in a terminal and paste the **output** (not the command text).
2. **`FIREBASE_SERVICE_ACCOUNT_JSON`** — Firebase Console → Service accounts → Generate new private key (paste full JSON as one line).
3. **Email:** `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `EMAIL_RECIPIENT`

Redeploy after changing env vars.

## Verify

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://algo-trader-umber.vercel.app/api/cron/strategies
```

- `401` — wrong or missing secret  
- `skipped: Market closed` — auth OK; try during 9:15–15:30 IST  
- `usersProcessed` / `totalTrades` — full run  

Ensure strategies are **Running** and mode **Paper** on the Strategies page.
