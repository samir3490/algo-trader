import { NextResponse } from "next/server";

// In-memory paper trading state (in production, use database)
let paperPortfolio = {
  balance: 1000000,
  initialBalance: 1000000,
  holdings: [] as Array<{
    symbol: string;
    exchange: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
  }>,
  trades: [] as Array<{
    id: string;
    symbol: string;
    exchange: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    total: number;
    executedAt: string;
  }>,
};

export async function GET() {
  const investedValue = paperPortfolio.holdings.reduce(
    (sum, h) => sum + h.avgPrice * h.quantity, 0
  );
  const currentValue = paperPortfolio.holdings.reduce(
    (sum, h) => sum + h.currentPrice * h.quantity, 0
  );

  return NextResponse.json({
    balance: paperPortfolio.balance,
    initialBalance: paperPortfolio.initialBalance,
    investedValue,
    currentValue,
    totalPnL: currentValue - investedValue,
    totalPnLPercent: investedValue > 0 ? ((currentValue - investedValue) / investedValue) * 100 : 0,
    holdings: paperPortfolio.holdings.map(h => ({
      ...h,
      investedValue: h.avgPrice * h.quantity,
      currentValue: h.currentPrice * h.quantity,
      pnl: (h.currentPrice - h.avgPrice) * h.quantity,
      pnlPercent: ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100,
    })),
    trades: paperPortfolio.trades,
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "reset") {
    paperPortfolio = {
      balance: 1000000,
      initialBalance: 1000000,
      holdings: [],
      trades: [],
    };
    return NextResponse.json({ message: "Portfolio reset" });
  }

  const { symbol, exchange = "NSE", side, quantity, price } = body;
  const total = quantity * price;

  if (side === "BUY") {
    if (total > paperPortfolio.balance) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    paperPortfolio.balance -= total;

    const existing = paperPortfolio.holdings.find(
      h => h.symbol === symbol && h.exchange === exchange
    );

    if (existing) {
      const totalQty = existing.quantity + quantity;
      existing.avgPrice = ((existing.avgPrice * existing.quantity) + total) / totalQty;
      existing.quantity = totalQty;
      existing.currentPrice = price;
    } else {
      paperPortfolio.holdings.push({
        symbol, exchange, quantity, avgPrice: price, currentPrice: price,
      });
    }
  } else if (side === "SELL") {
    const existing = paperPortfolio.holdings.find(
      h => h.symbol === symbol && h.exchange === exchange
    );

    if (!existing || existing.quantity < quantity) {
      return NextResponse.json({ error: "Insufficient holdings" }, { status: 400 });
    }

    paperPortfolio.balance += total;
    existing.quantity -= quantity;

    if (existing.quantity === 0) {
      paperPortfolio.holdings = paperPortfolio.holdings.filter(
        h => !(h.symbol === symbol && h.exchange === exchange)
      );
    }
  }

  paperPortfolio.trades.unshift({
    id: Date.now().toString(),
    symbol, exchange, side, quantity, price, total,
    executedAt: new Date().toISOString(),
  });

  return NextResponse.json({ message: "Order executed", balance: paperPortfolio.balance });
}
