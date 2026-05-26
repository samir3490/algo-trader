"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  Activity,
  BarChart3,
  LineChart,
  Layers,
  Plus,
  Play,
  Pause,
  Square,
  X,
  ChevronDown,
  Zap,
  Shield,
  Info,
  Target,
  Signal,
  Hash,
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { NSE_INSTRUMENTS } from "@/lib/instruments";

type StrategyType = "sma" | "ema" | "rsi" | "macd" | "bollinger";
type Timeframe = "1min" | "5min" | "15min" | "30min" | "1hr" | "Day";

interface StrategyParam {
  label: string;
  key: string;
  defaultValue: number;
}

interface StrategyDefinition {
  id: StrategyType;
  name: string;
  description: string;
  icon: React.ElementType;
  params: StrategyParam[];
}

interface ActiveStrategy {
  id: string;
  name: string;
  type: StrategyType;
  symbol: string;
  exchange: string;
  mode: "paper" | "live";
  status: "running" | "paused" | "stopped";
  signals: number;
  pnl: number;
  params: Record<string, number>;
  timeframe: Timeframe;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const ACTIVE_STRATEGIES_KEY = "activeStrategies";

const NIFTY50_SYMBOLS = NSE_INSTRUMENTS.slice(0, 50).map((i) => i.symbol);

const BANK_NIFTY_SYMBOLS = [
  "HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK",
  "INDUSINDBK", "BANDHANBNK", "FEDERALBNK", "IDFCFIRSTB", "PNB",
  "BANKBARODA", "CANBK",
];

const TOP100_SYMBOLS = NSE_INSTRUMENTS.slice(0, 100).map((i) => i.symbol);

const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    id: "sma",
    name: "SMA Crossover",
    description: "Buy when short SMA crosses above long SMA",
    icon: TrendingUp,
    params: [
      { label: "Short Period", key: "shortPeriod", defaultValue: 9 },
      { label: "Long Period", key: "longPeriod", defaultValue: 21 },
    ],
  },
  {
    id: "ema",
    name: "EMA Crossover",
    description: "Faster response using exponential moving averages",
    icon: Activity,
    params: [
      { label: "Short Period", key: "shortPeriod", defaultValue: 9 },
      { label: "Long Period", key: "longPeriod", defaultValue: 21 },
    ],
  },
  {
    id: "rsi",
    name: "RSI Strategy",
    description: "Buy at oversold (30), sell at overbought (70)",
    icon: BarChart3,
    params: [
      { label: "Period", key: "period", defaultValue: 14 },
      { label: "Oversold", key: "oversold", defaultValue: 30 },
      { label: "Overbought", key: "overbought", defaultValue: 70 },
    ],
  },
  {
    id: "macd",
    name: "MACD Crossover",
    description: "Signal line crossover for trend detection",
    icon: LineChart,
    params: [
      { label: "Fast", key: "fast", defaultValue: 12 },
      { label: "Slow", key: "slow", defaultValue: 26 },
      { label: "Signal", key: "signal", defaultValue: 9 },
    ],
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    description: "Trade at band touches for mean reversion",
    icon: Layers,
    params: [
      { label: "Period", key: "period", defaultValue: 20 },
      { label: "Multiplier", key: "multiplier", defaultValue: 2 },
    ],
  },
];

const TIMEFRAMES: Timeframe[] = ["1min", "5min", "15min", "30min", "1hr", "Day"];

function getDefaultParams(def: StrategyDefinition): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.defaultValue]));
}

function getStrategyDef(type: StrategyType): StrategyDefinition {
  return STRATEGY_DEFINITIONS.find((d) => d.id === type)!;
}

// ── Persistence ──────────────────────────────────────────────────────────

function loadActiveStrategies(): ActiveStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACTIVE_STRATEGIES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveActiveStrategies(strategies: ActiveStrategy[]) {
  try {
    localStorage.setItem(ACTIVE_STRATEGIES_KEY, JSON.stringify(strategies));
  } catch {}
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function StrategiesPage() {
  const [mounted, setMounted] = useState(false);
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);

  const [cardState, setCardState] = useState<
    Record<
      StrategyType,
      {
        params: Record<string, number>;
        symbols: string;
        timeframe: Timeframe;
        paperTrading: boolean;
        active: boolean;
      }
    >
  >(() => {
    const init: Record<string, {
      params: Record<string, number>;
      symbols: string;
      timeframe: Timeframe;
      paperTrading: boolean;
      active: boolean;
    }> = {};
    for (const def of STRATEGY_DEFINITIONS) {
      init[def.id] = {
        params: getDefaultParams(def),
        symbols: "RELIANCE",
        timeframe: "15min" as Timeframe,
        paperTrading: true,
        active: false,
      };
    }
    return init as Record<StrategyType, typeof init[string]>;
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<StrategyType>("sma");
  const [modalSymbols, setModalSymbols] = useState("RELIANCE");
  const [modalTimeframe, setModalTimeframe] = useState<Timeframe>("15min");
  const [modalPaper, setModalPaper] = useState(true);
  const [modalParams, setModalParams] = useState<Record<string, number>>(() =>
    getDefaultParams(STRATEGY_DEFINITIONS[0])
  );

  // Load persisted strategies on mount
  useEffect(() => {
    const loaded = loadActiveStrategies();
    setActiveStrategies(loaded);

    const newCardState = { ...cardState };
    for (const strat of loaded) {
      if (newCardState[strat.type]) {
        newCardState[strat.type] = {
          ...newCardState[strat.type],
          active: strat.status === "running" || strat.status === "paused",
        };
      }
    }
    setCardState(newCardState);
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist strategies whenever they change
  useEffect(() => {
    if (!mounted) return;
    saveActiveStrategies(activeStrategies);
  }, [activeStrategies, mounted]);

  const openModal = useCallback(() => {
    const def = STRATEGY_DEFINITIONS[0];
    setModalType(def.id);
    setModalSymbols("RELIANCE");
    setModalTimeframe("15min");
    setModalPaper(true);
    setModalParams(getDefaultParams(def));
    setModalOpen(true);
  }, []);

  const handleModalTypeChange = useCallback((type: StrategyType) => {
    setModalType(type);
    setModalParams(getDefaultParams(getStrategyDef(type)));
  }, []);

  function parseSymbols(input: string): string[] {
    return input
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
  }

  const handleModalSave = useCallback(() => {
    const symbols = parseSymbols(modalSymbols);
    const def = getStrategyDef(modalType);

    const newStrategies: ActiveStrategy[] = symbols.map((sym) => ({
      id: `active-${Date.now()}-${sym}`,
      name: def.name,
      type: modalType,
      symbol: sym,
      exchange: "NSE",
      mode: modalPaper ? "paper" : "live",
      status: "running" as const,
      signals: 0,
      pnl: 0,
      params: { ...modalParams },
      timeframe: modalTimeframe,
      createdAt: new Date().toISOString(),
    }));

    setActiveStrategies((prev) => [...prev, ...newStrategies]);
    setModalOpen(false);
  }, [modalType, modalSymbols, modalPaper, modalParams, modalTimeframe]);

  const toggleCardActive = useCallback(
    (id: StrategyType) => {
      const state = cardState[id];
      if (!state.active) {
        const def = getStrategyDef(id);
        const symbols = parseSymbols(state.symbols);
        const newStrategies: ActiveStrategy[] = symbols.map((sym) => ({
          id: `active-${Date.now()}-${sym}`,
          name: def.name,
          type: id,
          symbol: sym,
          exchange: "NSE",
          mode: state.paperTrading ? "paper" : "live",
          status: "running" as const,
          signals: 0,
          pnl: 0,
          params: { ...state.params },
          timeframe: state.timeframe,
          createdAt: new Date().toISOString(),
        }));
        setActiveStrategies((prev) => [...prev, ...newStrategies]);
      } else {
        const symbols = parseSymbols(state.symbols);
        setActiveStrategies((prev) =>
          prev.filter(
            (s) => !(s.type === id && symbols.includes(s.symbol))
          )
        );
      }
      setCardState((prev) => ({
        ...prev,
        [id]: { ...prev[id], active: !prev[id].active },
      }));
    },
    [cardState]
  );

  const toggleStrategyStatus = useCallback((id: string) => {
    setActiveStrategies((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === "running" ? "paused" : "running" }
          : s
      )
    );
  }, []);

  const stopStrategy = useCallback((id: string) => {
    setActiveStrategies((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const applyPreset = (target: "card" | "modal", cardId: StrategyType | null, preset: string) => {
    let symbols = "";
    if (preset === "nifty50") symbols = NIFTY50_SYMBOLS.join(", ");
    else if (preset === "banknifty") symbols = BANK_NIFTY_SYMBOLS.join(", ");
    else if (preset === "top100") symbols = TOP100_SYMBOLS.join(", ");

    if (target === "modal") {
      setModalSymbols(symbols);
    } else if (cardId) {
      setCardState((prev) => ({
        ...prev,
        [cardId]: { ...prev[cardId], symbols },
      }));
    }
  };

  // Performance stats
  const totalSignals = activeStrategies.reduce((sum, s) => sum + s.signals, 0);
  const totalPnl = activeStrategies.reduce((sum, s) => sum + s.pnl, 0);
  const runningCount = activeStrategies.filter((s) => s.status === "running").length;
  const pausedCount = activeStrategies.filter((s) => s.status === "paused").length;

  return (
    <div className="min-h-screen space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Strategies</h1>
          <p className="mt-1 text-sm text-gray-400">
            Configure and manage your algorithmic trading strategies
          </p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Create Strategy
        </button>
      </div>

      {/* ── How Strategies Work ────────────────────────────────────────── */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-blue-300">How Strategies Work</h3>
            <ul className="space-y-1.5 text-xs text-gray-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <Signal className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                Strategies scan configured stocks at the selected timeframe interval
              </li>
              <li className="flex items-start gap-2">
                <Target className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                When a BUY/SELL signal is generated, it will auto-place orders in the selected mode
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-amber-400">Paper mode:</strong> orders placed in paper portfolio
                  <span className="mx-2 text-gray-600">|</span>
                  <strong className="text-red-400">Live mode:</strong> orders placed via Zerodha
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Strategy Performance Overview ──────────────────────────────── */}
      {activeStrategies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-800 bg-[#111827] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">Total Strategies</span>
            </div>
            <p className="text-xl font-bold text-white">
              {activeStrategies.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {runningCount} running · {pausedCount} paused
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-[#111827] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Signal className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">Total Signals</span>
            </div>
            <p className="text-xl font-bold text-white">{totalSignals}</p>
            <p className="text-xs text-gray-500 mt-1">Across all strategies</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-[#111827] p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">Total P&amp;L</span>
            </div>
            <p className={cn("text-xl font-bold", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
              {formatCurrency(totalPnl)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Combined performance</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-[#111827] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">Unique Symbols</span>
            </div>
            <p className="text-xl font-bold text-white">
              {new Set(activeStrategies.map((s) => s.symbol)).size}
            </p>
            <p className="text-xs text-gray-500 mt-1">Being monitored</p>
          </div>
        </div>
      )}

      {/* Strategy Cards Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {STRATEGY_DEFINITIONS.map((def) => {
          const state = cardState[def.id];
          const Icon = def.icon;
          return (
            <div
              key={def.id}
              className={cn(
                "group relative rounded-xl border p-5 transition-all duration-200",
                state.active
                  ? "border-blue-500/40 bg-[#111827] shadow-lg shadow-blue-500/5"
                  : "border-gray-800 bg-[#111827] hover:border-gray-700"
              )}
            >
              {/* Status dot */}
              <div className="absolute right-4 top-4">
                <span
                  className={cn(
                    "inline-flex h-2.5 w-2.5 rounded-full",
                    state.active ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-600"
                  )}
                />
              </div>

              {/* Name & icon */}
              <div className="mb-3 flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    state.active ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 text-gray-400"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{def.name}</h3>
              </div>

              <p className="mb-4 text-sm leading-relaxed text-gray-400">{def.description}</p>

              {/* Parameter inputs */}
              <div className="mb-4 space-y-2">
                <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Parameters
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {def.params.map((p) => (
                    <div key={p.key}>
                      <label className="mb-1 block text-xs text-gray-500">{p.label}</label>
                      <input
                        type="number"
                        value={state.params[p.key]}
                        onChange={(e) =>
                          setCardState((prev) => ({
                            ...prev,
                            [def.id]: {
                              ...prev[def.id],
                              params: {
                                ...prev[def.id].params,
                                [p.key]: Number(e.target.value),
                              },
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Symbols (multi-symbol) */}
              <div className="mb-3">
                <label className="mb-1 block text-xs text-gray-500">Symbols (comma-separated)</label>
                <input
                  type="text"
                  value={state.symbols}
                  onChange={(e) =>
                    setCardState((prev) => ({
                      ...prev,
                      [def.id]: { ...prev[def.id], symbols: e.target.value },
                    }))
                  }
                  placeholder="RELIANCE, TCS, INFY"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-sm uppercase text-white outline-none transition-colors focus:border-blue-500 placeholder:text-gray-600 placeholder:normal-case"
                />
                {/* Preset buttons */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-gray-600">Presets:</span>
                  {[
                    { label: "Nifty 50", key: "nifty50" },
                    { label: "Bank Nifty", key: "banknifty" },
                    { label: "Top 100", key: "top100" },
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset("card", def.id, preset.key)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeframe */}
              <div className="mb-4">
                <label className="mb-1 block text-xs text-gray-500">Timeframe</label>
                <div className="relative">
                  <select
                    value={state.timeframe}
                    onChange={(e) =>
                      setCardState((prev) => ({
                        ...prev,
                        [def.id]: {
                          ...prev[def.id],
                          timeframe: e.target.value as Timeframe,
                        },
                      }))
                    }
                    className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
                  >
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                </div>
              </div>

              {/* Paper / Live toggle + Activate */}
              <div className="flex items-center justify-between border-t border-gray-800 pt-4">
                <button
                  onClick={() =>
                    setCardState((prev) => ({
                      ...prev,
                      [def.id]: {
                        ...prev[def.id],
                        paperTrading: !prev[def.id].paperTrading,
                      },
                    }))
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    state.paperTrading
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-red-500/10 text-red-400"
                  )}
                >
                  {state.paperTrading ? (
                    <Shield className="h-3.5 w-3.5" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {state.paperTrading ? "Paper" : "Live"}
                </button>

                <button
                  onClick={() => toggleCardActive(def.id)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors",
                    state.active
                      ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-blue-600 text-white hover:bg-blue-500"
                  )}
                >
                  {state.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Strategies Table */}
      <div className="rounded-xl border border-gray-800 bg-[#111827]">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Active Strategies</h2>
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
            {runningCount} running
          </span>
        </div>

        {activeStrategies.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No active strategies. Activate a strategy above or create a new one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-medium">Strategy</th>
                  <th className="px-6 py-3 font-medium">Symbol</th>
                  <th className="px-6 py-3 font-medium">Mode</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Timeframe</th>
                  <th className="px-6 py-3 font-medium">Signals</th>
                  <th className="px-6 py-3 font-medium">P&amp;L</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {activeStrategies.map((s) => {
                  const def = getStrategyDef(s.type);
                  const Icon = def.icon;
                  return (
                    <tr
                      key={s.id}
                      className="transition-colors hover:bg-gray-800/40"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 text-blue-400" />
                          <span className="font-medium text-white">
                            {def.name}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-300">
                        {s.symbol}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            s.mode === "paper"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                          )}
                        >
                          {s.mode === "paper" ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                          {s.mode === "paper" ? "Paper" : "Live"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-medium",
                            s.status === "running"
                              ? "text-emerald-400"
                              : s.status === "paused"
                                ? "text-yellow-400"
                                : "text-red-400"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              s.status === "running"
                                ? "bg-emerald-400"
                                : s.status === "paused"
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                            )}
                          />
                          {s.status === "running" ? "Running" : s.status === "paused" ? "Paused" : "Stopped"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-gray-400 text-xs">
                        {s.timeframe}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-gray-300">
                        {s.signals}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={cn(
                            "font-medium",
                            s.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                          )}
                        >
                          {formatCurrency(s.pnl)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleStrategyStatus(s.id)}
                            className={cn(
                              "rounded-lg p-1.5 transition-colors",
                              s.status === "running"
                                ? "text-yellow-400 hover:bg-yellow-400/10"
                                : "text-emerald-400 hover:bg-emerald-400/10"
                            )}
                            title={
                              s.status === "running"
                                ? "Pause strategy"
                                : "Resume strategy"
                            }
                          >
                            {s.status === "running" ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => stopStrategy(s.id)}
                            className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-400/10"
                            title="Stop strategy"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Strategy Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-gray-800 bg-[#111827] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Create Strategy
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Strategy type */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Strategy Type
                </label>
                <div className="relative">
                  <select
                    value={modalType}
                    onChange={(e) =>
                      handleModalTypeChange(e.target.value as StrategyType)
                    }
                    className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500"
                  >
                    {STRATEGY_DEFINITIONS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                </div>
              </div>

              {/* Symbols (multi-symbol) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Symbols (comma-separated)
                </label>
                <input
                  type="text"
                  value={modalSymbols}
                  onChange={(e) => setModalSymbols(e.target.value)}
                  placeholder="RELIANCE, TCS, INFY"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm uppercase text-white outline-none transition-colors focus:border-blue-500 placeholder:text-gray-600 placeholder:normal-case"
                />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-gray-600">Presets:</span>
                  {[
                    { label: "Nifty 50", key: "nifty50" },
                    { label: "Bank Nifty", key: "banknifty" },
                    { label: "Top 100", key: "top100" },
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset("modal", null, preset.key)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {parseSymbols(modalSymbols).length > 1 && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    {parseSymbols(modalSymbols).length} symbols selected — a separate strategy will run for each
                  </p>
                )}
              </div>

              {/* Timeframe */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Timeframe
                </label>
                <div className="relative">
                  <select
                    value={modalTimeframe}
                    onChange={(e) =>
                      setModalTimeframe(e.target.value as Timeframe)
                    }
                    className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500"
                  >
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                </div>
              </div>

              {/* Dynamic params */}
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-300">
                  Parameters
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {getStrategyDef(modalType).params.map((p) => (
                    <div key={p.key}>
                      <label className="mb-1 block text-xs text-gray-500">
                        {p.label}
                      </label>
                      <input
                        type="number"
                        value={modalParams[p.key] ?? p.defaultValue}
                        onChange={(e) =>
                          setModalParams((prev) => ({
                            ...prev,
                            [p.key]: Number(e.target.value),
                          }))
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Paper / Live */}
              <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                <span className="text-sm text-gray-300">Trading Mode</span>
                <button
                  onClick={() => setModalPaper((p) => !p)}
                  className="relative inline-flex h-7 w-[120px] items-center rounded-full bg-gray-800 p-0.5"
                >
                  <span
                    className={cn(
                      "absolute h-6 w-[58px] rounded-full transition-all duration-200",
                      modalPaper
                        ? "left-0.5 bg-amber-500/30"
                        : "left-[60px] bg-red-500/30"
                    )}
                  />
                  <span
                    className={cn(
                      "relative z-10 w-1/2 text-center text-xs font-medium transition-colors",
                      modalPaper ? "text-amber-300" : "text-gray-500"
                    )}
                  >
                    Paper
                  </span>
                  <span
                    className={cn(
                      "relative z-10 w-1/2 text-center text-xs font-medium transition-colors",
                      !modalPaper ? "text-red-300" : "text-gray-500"
                    )}
                  >
                    Live
                  </span>
                </button>
              </div>

              {/* Save */}
              <button
                onClick={handleModalSave}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Save &amp; Activate
                {parseSymbols(modalSymbols).length > 1 && (
                  <span className="ml-1 text-blue-200">
                    ({parseSymbols(modalSymbols).length} symbols)
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
