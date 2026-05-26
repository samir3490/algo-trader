# AlgoTrader - Indian Market Algo Trading Platform

A comprehensive algorithmic trading platform built for the Indian share market (NSE/BSE) with paper trading, real-time strategy execution, and Zerodha integration.

## Features

- **Paper Trading** - Practice with virtual money (₹10,00,000) using real market data
- **Algo Strategies** - Pre-built strategies: SMA Crossover, EMA Crossover, RSI, MACD, Bollinger Bands
- **Zerodha Integration** - Connect your Zerodha account for live intraday trading
- **Auto Order Placement** - Automatically place orders based on strategy signals
- **Real-time Dashboard** - Portfolio tracking, watchlists, and P&L monitoring
- **Order Management** - Track all paper and live orders in one place

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL + Prisma ORM
- **Broker API**: Zerodha Kite Connect
- **Charts**: Recharts
- **State**: Zustand
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon, Supabase, or Vercel Postgres)
- Zerodha Kite Connect API credentials (from [Kite Connect Developer](https://developers.kite.trade/))

### Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/algo-trader.git
cd algo-trader
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your values:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Random secret for auth
- `KITE_API_KEY` - Zerodha Kite Connect API key
- `KITE_API_SECRET` - Zerodha Kite Connect API secret

4. Set up the database:
```bash
npx prisma db push
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Zerodha Integration

1. Create an app at [Kite Connect Developer Console](https://developers.kite.trade/)
2. Set the redirect URL to `http://localhost:3000/api/zerodha/callback`
3. Add your API key and secret to `.env`
4. Click "Connect to Zerodha" in the Live Trading page

## Trading Strategies

| Strategy | Description | Parameters |
|----------|-------------|------------|
| SMA Crossover | Short/Long SMA crossover signals | Short Period, Long Period |
| EMA Crossover | Exponential MA crossover (faster response) | Short Period, Long Period |
| RSI | Overbought/Oversold levels | Period, Oversold, Overbought |
| MACD | Signal line crossover | Fast, Slow, Signal periods |
| Bollinger Bands | Mean reversion at band touches | Period, Multiplier |

## Disclaimer

This software is for educational purposes. Algorithmic trading involves significant financial risk. Always test strategies with paper trading before using real money. The developers are not responsible for any financial losses.

## License

MIT
