"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

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
  type: StrategyType;
  symbol: string;
  mode: "paper" | "live";
  status: "running" | "paused";
  signalsToday: number;
  pnl: number;
  params: Record<string, number>;
  timeframe: Timeframe;
}

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

export default function StrategiesPage() {
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);

  const [cardState, setCardState] = useState<
    Record<
      StrategyType,
      {
        params: Record<string, number>;
        symbol: string;
        timeframe: Timeframe;
        paperTrading: boolean;
        active: boolean;
      }
    >
  >(() => {
    const init: any = {};
    for (const def of STRATEGY_DEFINITIONS) {
      init[def.id] = {
        params: getDefaultParams(def),
        symbol: "RELIANCE",
        timeframe: "15min" as Timeframe,
        paperTrading: true,
        active: false,
      };
    }
    return init;
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<StrategyType>("sma");
  const [modalSymbol, setModalSymbol] = useState("RELIANCE");
  const [modalTimeframe, setModalTimeframe] = useState<Timeframe>("15min");
  const [modalPaper, setModalPaper] = useState(true);
  const [modalParams, setModalParams] = useState<Record<string, number>>(() =>
    getDefaultParams(STRATEGY_DEFINITIONS[0])
  );

  const openModal = useCallback(() => {
    const def = STRATEGY_DEFINITIONS[0];
    setModalType(def.id);
    setModalSymbol("RELIANCE");
    setModalTimeframe("15min");
    setModalPaper(true);
    setModalParams(getDefaultParams(def));
    setModalOpen(true);
  }, []);

  const handleModalTypeChange = useCallback((type: StrategyType) => {
    setModalType(type);
    setModalParams(getDefaultParams(getStrategyDef(type)));
  }, []);

  const handleModalSave = useCallback(() => {
    const newStrategy: ActiveStrategy = {
      id: `active-${Date.now()}`,
      type: modalType,
      symbol: modalSymbol.toUpperCase(),
      mode: modalPaper ? "paper" : "live",
      status: "running",
      signalsToday: 0,
      pnl: 0,
      params: { ...modalParams },
      timeframe: modalTimeframe,
    };
    setActiveStrategies((prev) => [...prev, newStrategy]);
    setModalOpen(false);
  }, [modalType, modalSymbol, modalPaper, modalParams, modalTimeframe]);

  const toggleCardActive = useCallback(
    (id: StrategyType) => {
      const state = cardState[id];
      if (!state.active) {
        const def = getStrategyDef(id);
        const newActive: ActiveStrategy = {
          id: `active-${Date.now()}`,
          type: id,
          symbol: state.symbol.toUpperCase(),
          mode: state.paperTrading ? "paper" : "live",
          status: "running",
          signalsToday: 0,
          pnl: 0,
          params: { ...state.params },
          timeframe: state.timeframe,
        };
        setActiveStrategies((prev) => [...prev, newActive]);
      } else {
        setActiveStrategies((prev) =>
          prev.filter(
            (s) =>
              !(s.type === id && s.symbol === state.symbol.toUpperCase())
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

              {/* Symbol */}
              <div className="mb-3">
                <label className="mb-1 block text-xs text-gray-500">Symbol</label>
                <input
                  type="text"
                  value={state.symbol}
                  onChange={(e) =>
                    setCardState((prev) => ({
                      ...prev,
                      [def.id]: { ...prev[def.id], symbol: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-sm uppercase text-white outline-none transition-colors focus:border-blue-500"
                />
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
                {/* Paper/Live toggle */}
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
            {activeStrategies.length} running
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
                  <th className="px-6 py-3 font-medium">Signals Today</th>
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
                              : "text-yellow-400"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              s.status === "running"
                                ? "bg-emerald-400"
                                : "bg-yellow-400"
                            )}
                          />
                          {s.status === "running" ? "Running" : "Paused"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-gray-300">
                        {s.signalsToday}
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
          <div className="relative w-full max-w-md rounded-xl border border-gray-800 bg-[#111827] p-6 shadow-2xl">
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

              {/* Symbol */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Symbol
                </label>
                <input
                  type="text"
                  value={modalSymbol}
                  onChange={(e) => setModalSymbol(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm uppercase text-white outline-none transition-colors focus:border-blue-500"
                />
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
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
