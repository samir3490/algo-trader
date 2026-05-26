export interface MarketQuote {
  symbol: string;
  exchange: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

export interface OHLC {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategySignal {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  price: number;
  quantity: number;
  reason: string;
  confidence: number;
  timestamp: Date;
}

export interface StrategyConfig {
  symbols: string[];
  timeframe: "1minute" | "5minute" | "15minute" | "30minute" | "60minute" | "day";
  parameters: Record<string, number>;
}

export interface PaperPortfolioSummary {
  balance: number;
  initialBalance: number;
  investedValue: number;
  currentValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  holdings: PaperHoldingSummary[];
  todayPnL: number;
}

export interface PaperHoldingSummary {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface TradeEntry {
  id: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  executedAt: Date;
}

export type TradingMode = "paper" | "live";

export interface KiteProfile {
  userId: string;
  userName: string;
  email: string;
  broker: string;
  exchanges: string[];
}

export interface KitePosition {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  value: number;
}

export const NSE_INDICES = [
  "NIFTY 50",
  "NIFTY BANK",
  "NIFTY IT",
  "NIFTY PHARMA",
  "NIFTY AUTO",
  "NIFTY FMCG",
  "NIFTY METAL",
  "NIFTY REALTY",
  "NIFTY ENERGY",
  "NIFTY INFRA",
] as const;

export const POPULAR_STOCKS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
  "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
  "LT", "AXISBANK", "ASIANPAINT", "MARUTI", "BAJFINANCE",
  "TITAN", "SUNPHARMA", "WIPRO", "ULTRACEMCO", "HCLTECH",
  "TATAMOTORS", "TATASTEEL", "POWERGRID", "NTPC", "ONGC",
  "JSWSTEEL", "ADANIENT", "ADANIPORTS", "TECHM", "BAJAJFINSV",
] as const;
