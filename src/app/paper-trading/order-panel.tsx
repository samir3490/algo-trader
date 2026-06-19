"use client";

import {
  Search,
  Plus,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { cn, formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import { paperOrderNotional } from "@/lib/portfolio/paper-position-size";
import type { AppSettings } from "@/lib/firebase";

type OrderSide = "BUY" | "SELL";
type Exchange = "NSE" | "BSE";
type OrderType = "MARKET" | "LIMIT";

interface InstrumentResult {
  tradingsymbol: string;
  name: string;
  exchange: string;
  instrument_type: string;
}

interface StockQuote {
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
  lowerCircuit: number;
  upperCircuit: number;
  buyDepth?: { price?: number; quantity?: number; orders?: number }[];
  sellDepth?: { price?: number; quantity?: number; orders?: number }[];
  totalBuyQty?: number;
  totalSellQty?: number;
}

export interface PaperOrderPanelProps {
  open: boolean;
  onClose: () => void;
  orderSide: OrderSide;
  setOrderSide: (side: OrderSide) => void;
  symbol: string;
  onSymbolChange: (value: string) => void;
  exchange: Exchange;
  setExchange: (ex: Exchange) => void;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  limitPrice: string;
  setLimitPrice: (v: string) => void;
  manualPrice: string;
  setManualPrice: (v: string) => void;
  zerodhaConnected: boolean;
  isCheckingAuth: boolean;
  quote: StockQuote | null;
  isLoadingQuote: boolean;
  searchResults: InstrumentResult[];
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  isSearching: boolean;
  onSearchFocus: () => void;
  onClearSymbol: () => void;
  onSelectSymbol: (item: InstrumentResult) => void;
  searchInstruments: (q: string) => void;
  orderQty: number;
  buyQty: number;
  selectedHolding: boolean;
  estimatedPrice: number | null;
  estimatedCost: number | null;
  validationError: string;
  setValidationError: (v: string) => void;
  appSettings: AppSettings | null;
  onPlaceOrder: () => void;
}

export function PaperOrderPanel({
  open,
  onClose,
  orderSide,
  setOrderSide,
  symbol,
  onSymbolChange,
  exchange,
  setExchange,
  orderType,
  setOrderType,
  limitPrice,
  setLimitPrice,
  manualPrice,
  setManualPrice,
  zerodhaConnected,
  isCheckingAuth,
  quote,
  isLoadingQuote,
  searchResults,
  showSuggestions,
  setShowSuggestions,
  isSearching,
  onSearchFocus,
  onClearSymbol,
  onSelectSymbol,
  searchInstruments,
  orderQty,
  buyQty,
  selectedHolding,
  estimatedPrice,
  estimatedCost,
  validationError,
  setValidationError,
  appSettings,
  onPlaceOrder,
}: PaperOrderPanelProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close order panel"
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-bg-secondary shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paper-order-panel-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 id="paper-order-panel-title" className="text-lg font-semibold text-text-primary">
            Place Order
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex rounded-lg bg-bg-primary p-1">
            {(["BUY", "SELL"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => {
                  setOrderSide(side);
                  setValidationError("");
                }}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-semibold transition-all duration-200 cursor-pointer",
                  orderSide === side
                    ? side === "BUY"
                      ? "bg-profit text-white shadow-md"
                      : "bg-loss text-white shadow-md"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {side}
              </button>
            ))}
          </div>

          <div className="relative">
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-tertiary">
              Symbol
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search stocks..."
                value={symbol}
                onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
                onFocus={() => {
                  setShowSuggestions(true);
                  onSearchFocus();
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="w-full rounded-lg border border-border bg-bg-primary py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
              {(isLoadingQuote || isSearching) && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent" />
              )}
              {symbol && !isLoadingQuote && !isSearching && (
                <button
                  type="button"
                  onClick={onClearSymbol}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showSuggestions && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-bg-elevated shadow-xl">
                {searchResults.map((item, i) => (
                  <button
                    key={`${item.tradingsymbol}-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectSymbol(item)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-accent/10"
                  >
                    <div>
                      <span className="font-medium text-text-primary">{item.tradingsymbol}</span>
                      {item.name && item.name !== item.tradingsymbol && (
                        <span className="ml-2 text-xs text-text-tertiary">{item.name}</span>
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary">{item.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {symbol.trim() && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-bg-primary px-3 py-2.5">
              <span className="text-xs text-text-tertiary">
                {symbol} · {exchange}
              </span>
              {isLoadingQuote ? (
                <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading price...
                </span>
              ) : quote ? (
                <div className="text-right">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      quote.changePercent >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    {formatCurrency(quote.lastPrice)}
                  </span>
                  <span
                    className={cn(
                      "ml-2 text-xs",
                      quote.changePercent >= 0 ? "text-profit/80" : "text-loss/80"
                    )}
                  >
                    {quote.change >= 0 ? "+" : ""}
                    {quote.change?.toFixed(2)} ({formatPercent(quote.changePercent)})
                  </span>
                </div>
              ) : zerodhaConnected ? (
                <span className="text-xs text-text-tertiary">Price unavailable</span>
              ) : (
                <span className="text-xs text-amber-400/80">Connect Zerodha for live price</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-tertiary">
                Exchange
              </label>
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value as Exchange)}
                className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-tertiary">
                Order Type
              </label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as OrderType)}
                className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-tertiary">
                Product
              </label>
              <div className="rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary">
                {appSettings?.paperDefaultProduct ?? "CNC"}
                <span className="ml-1 text-xs text-text-tertiary">
                  ({appSettings?.paperDefaultProduct === "MIS" ? "Intraday" : "Delivery"})
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-primary px-3 py-2.5">
            <p className="mb-1 text-xs uppercase tracking-wider text-text-tertiary">Order size</p>
            {orderSide === "SELL" ? (
              <p className="text-sm text-text-primary">
                <span className="font-semibold">{formatNumber(orderQty)}</span> shares
                {selectedHolding ? (
                  <span className="text-text-tertiary"> (full position)</span>
                ) : (
                  <span className="text-text-tertiary"> — select a held symbol</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-text-primary">
                <span className="font-semibold">{formatNumber(buyQty || 0)}</span> shares
                <span className="text-text-tertiary">
                  {" "}
                  ≈{" "}
                  {formatCurrency(
                    paperOrderNotional(
                      appSettings ?? { paperOrderNotional: 100_000 }
                    )
                  )}
                  {estimatedPrice && estimatedPrice > 0
                    ? ` @ ${formatCurrency(estimatedPrice)}`
                    : " (set price to preview)"}
                </span>
              </p>
            )}
          </div>

          {orderType === "LIMIT" && (
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-tertiary">
                Limit Price
              </label>
              <input
                type="number"
                min={0}
                step={0.05}
                placeholder="0.00"
                value={limitPrice}
                onChange={(e) => {
                  setLimitPrice(e.target.value);
                  setValidationError("");
                }}
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {orderType === "MARKET" && !zerodhaConnected && (
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-text-tertiary">
                Price (Manual Entry)
              </label>
              <input
                type="number"
                min={0}
                step={0.05}
                placeholder="Enter current market price"
                value={manualPrice}
                onChange={(e) => {
                  setManualPrice(e.target.value);
                  setValidationError("");
                }}
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {orderType === "MARKET" && zerodhaConnected && quote && (
            <div className="flex items-center justify-between rounded-lg bg-bg-primary px-3 py-2.5">
              <span className="text-xs text-text-tertiary">Market Price</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatCurrency(quote.lastPrice)}
              </span>
            </div>
          )}

          {estimatedCost !== null && estimatedCost > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-bg-primary px-3 py-2.5">
              <span className="text-xs text-text-tertiary">
                Estimated {orderSide === "BUY" ? "Cost" : "Value"}
                {appSettings?.simulateBrokerage ? " (incl. charges)" : ""}
              </span>
              <span className="text-sm font-semibold text-text-primary">
                {formatCurrency(estimatedCost)}
              </span>
            </div>
          )}

          {validationError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span className="text-xs text-red-400">{validationError}</span>
            </div>
          )}

          {!zerodhaConnected && !isCheckingAuth && symbol.trim() && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400/80">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-xs text-text-tertiary">
                Connect Zerodha for live prices, or enter price manually above.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onPlaceOrder}
            className={cn(
              "w-full rounded-lg py-3 text-sm font-semibold transition-all",
              orderSide === "BUY"
                ? "bg-profit text-white shadow-lg shadow-profit/20 hover:bg-emerald-400"
                : "bg-loss text-white shadow-lg shadow-loss/20 hover:bg-red-400"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" />
              Place {orderSide} Order
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
