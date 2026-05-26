import { create } from "zustand";
import type { TradingMode, PaperPortfolioSummary, MarketQuote } from "@/types";

interface AppState {
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;

  isKiteConnected: boolean;
  setKiteConnected: (connected: boolean) => void;

  paperPortfolio: PaperPortfolioSummary | null;
  setPaperPortfolio: (portfolio: PaperPortfolioSummary) => void;

  watchlist: MarketQuote[];
  setWatchlist: (quotes: MarketQuote[]) => void;

  selectedSymbol: string | null;
  setSelectedSymbol: (symbol: string | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  tradingMode: "paper",
  setTradingMode: (mode) => set({ tradingMode: mode }),

  isKiteConnected: false,
  setKiteConnected: (connected) => set({ isKiteConnected: connected }),

  paperPortfolio: null,
  setPaperPortfolio: (portfolio) => set({ paperPortfolio: portfolio }),

  watchlist: [],
  setWatchlist: (quotes) => set({ watchlist: quotes }),

  selectedSymbol: null,
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
