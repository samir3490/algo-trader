"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  Plus,
  Play,
  Pause,
  Square,
  X,
  ChevronDown,
  Zap,
  Shield,
  Loader2,
  BarChart3,
  ScrollText,
  CheckCircle2,
} from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { NSE_INSTRUMENTS } from "@/lib/instruments";
import {
  getActiveStrategies as getFirestoreStrategies,
  getStrategyRunnerMeta,
  getPaperTradingState,
  getSettings,
  saveActiveStrategies as saveFirestoreStrategies,
  type ActiveStrategy as FirestoreStrategy,
  type StrategyRunnerMeta,
} from "@/lib/firebase";
import {
  STRATEGY_DEFINITIONS,
  TIMEFRAMES,
  getDefaultParams,
  getStrategyDef,
  inferStrategyType,
  type StrategyType,
  type Timeframe,
} from "@/lib/strategies/definitions";
import BacktestPanel from "@/components/backtest-panel";
import AuditLogsPanel from "@/components/audit-logs-panel";
import TradeAuditPanel from "@/components/trade-audit-panel";
import LastScanPanel from "@/components/last-scan-panel";
import { formatScanAuditMessage } from "@/lib/strategies/scan-diagnostics";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import StrategiesSectionNav, {
  strategiesSectionFromParam,
  type StrategiesSection,
} from "@/components/strategies/strategies-section-nav";
import {
  NIFTY50_SYMBOLS,
  BANK_NIFTY_SYMBOLS,
  TOP100_SYMBOLS,
} from "@/lib/universe/symbol-lists";

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
  symbols?: string[];
  universe?: "nifty50" | "banknifty" | "top100" | "custom";
  universeTopN?: number;
}

// ── Constants ────────────────────────────────────────────────────────────

const ACTIVE_STRATEGIES_KEY = "activeStrategies";

// ── Persistence ──────────────────────────────────────────────────────────

function loadActiveStrategiesFromCache(): ActiveStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACTIVE_STRATEGIES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveActiveStrategiesToCache(strategies: ActiveStrategy[]) {
  try {
    localStorage.setItem(ACTIVE_STRATEGIES_KEY, JSON.stringify(strategies));
  } catch {}
}

function localToFirestore(strategies: ActiveStrategy[]): FirestoreStrategy[] {
  return strategies.map((s) => ({
    id: s.id,
    name: s.name,
    symbol: s.symbol,
    exchange: s.exchange,
    timeframe: s.timeframe,
    mode: s.mode,
    params: s.params,
    status: s.status,
    createdAt: s.createdAt,
    signals: s.signals,
    pnl: s.pnl,
    ...(s.symbols?.length ? { symbols: s.symbols } : {}),
    ...(s.universe ? { universe: s.universe } : {}),
    ...(s.universeTopN != null ? { universeTopN: s.universeTopN } : {}),
  }));
}

function firestoreToLocal(strategies: FirestoreStrategy[]): ActiveStrategy[] {
  return strategies.map((s) => ({
    id: s.id,
    name: s.name,
    type: inferStrategyType(s.name),
    symbol: s.symbol,
    exchange: s.exchange,
    mode: s.mode === "live" ? "live" : "paper",
    status: s.status,
    signals: s.signals,
    pnl: s.pnl,
    params: s.params,
    timeframe: s.timeframe as Timeframe,
    createdAt: s.createdAt,
    symbols: s.symbols,
    universe: s.universe,
    universeTopN: s.universeTopN,
  }));
}

function persistStrategies(strategies: ActiveStrategy[]) {
  saveActiveStrategiesToCache(strategies);
  saveFirestoreStrategies(localToFirestore(strategies));
}

function formatScanFeedback(
  summary: StrategyRunnerMeta["lastScanSummary"]
): string {
  if (!summary) return "";
  const detail = formatScanAuditMessage(
    summary.signalsFound,
    summary.tradesExecuted,
    summary.diagnostics
  );
  return detail.startsWith("Scan:")
    ? detail.replace(/^Scan:/, "Last scan:")
    : detail;
}

function ActiveStrategiesTable({
  activeStrategies,
  onToggleStatus,
  onStop,
}: {
  activeStrategies: ActiveStrategy[];
  onToggleStatus: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "pnl",
    dir: "desc",
  });
  const sorted = useMemo(
    () =>
      sortRows(activeStrategies, {
        strategy: (s) => getStrategyDef(s.type).name,
        symbol: (s) =>
          s.symbols && s.symbols.length > 1
            ? `Universe (${s.symbols.length})`
            : s.symbol,
        mode: (s) => s.mode,
        status: (s) => s.status,
        timeframe: (s) => s.timeframe,
        signals: (s) => s.signals,
        pnl: (s) => s.pnl,
      }),
    [activeStrategies, sortRows]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wider text-text-tertiary">
            <SortableTh sortKey="strategy" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">Strategy</SortableTh>
            <SortableTh sortKey="symbol" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">Symbol</SortableTh>
            <SortableTh sortKey="mode" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">Mode</SortableTh>
            <SortableTh sortKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">Status</SortableTh>
            <SortableTh sortKey="timeframe" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">Timeframe</SortableTh>
            <SortableTh sortKey="signals" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">Signals</SortableTh>
            <SortableTh sortKey="pnl" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-6 py-3 font-medium">P&amp;L</SortableTh>
            <th className="px-6 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((s) => {
            const def = getStrategyDef(s.type);
            const Icon = def.icon;
            return (
              <tr
                key={s.id}
                className="transition-colors hover:bg-bg-tertiary/40"
              >
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-accent" />
                    <span className="font-medium text-text-primary">
                      {def.name}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-text-secondary">
                  {s.symbols && s.symbols.length > 1
                    ? `Universe (${s.symbols.length})`
                    : s.symbol}
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
                    {s.status === "running"
                      ? "Running"
                      : s.status === "paused"
                        ? "Paused"
                        : "Stopped"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-text-secondary text-xs">
                  {s.timeframe}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-text-secondary">
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
                      onClick={() => onToggleStatus(s.id)}
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
                      onClick={() => onStop(s.id)}
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

function StrategiesPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const hydratingRef = useRef(true);
  const [pageSection, setPageSection] = useState<StrategiesSection>("configure");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "basic" | "advanced">("all");
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);

  const setSection = useCallback(
    (section: StrategiesSection) => {
      setPageSection(section);
      const params = new URLSearchParams(searchParams.toString());
      if (section === "configure") {
        params.delete("tab");
      } else {
        params.set("tab", section);
      }
      const q = params.toString();
      router.replace(q ? `/strategies?${q}` : "/strategies", { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router, searchParams]
  );

  useEffect(() => {
    const tab = strategiesSectionFromParam(searchParams.get("tab"));
    if (tab) setPageSection(tab);
  }, [searchParams]);

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
  const [lastRunnerAt, setLastRunnerAt] = useState<string | null>(null);
  const [lastCronAt, setLastCronAt] = useState<string | null>(null);
  const [lastScanSummary, setLastScanSummary] = useState<
    StrategyRunnerMeta["lastScanSummary"] | null
  >(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [expandedCard, setExpandedCard] = useState<StrategyType | null>(null);
  const [paperTotalPnl, setPaperTotalPnl] = useState<number | null>(null);

  // Load persisted strategies on mount (avoid persisting empty state before hydration)
  useEffect(() => {
    let cancelled = false;

    function applyToCards(loaded: ActiveStrategy[]) {
      setCardState((prev) => {
        const next = { ...prev };
        for (const strat of loaded) {
          if (next[strat.type]) {
            next[strat.type] = {
              ...next[strat.type],
              active: strat.status === "running" || strat.status === "paused",
            };
          }
        }
        return next;
      });
    }

    async function finishHydration(loaded: ActiveStrategy[]) {
      if (cancelled) return;
      setActiveStrategies(loaded);
      saveActiveStrategiesToCache(loaded);
      applyToCards(loaded);
      hydratingRef.current = false;
      setMounted(true);
    }

    const cached = loadActiveStrategiesFromCache();
    applyToCards(cached);

    if (!user) {
      finishHydration(cached);
      return () => {
        cancelled = true;
      };
    }

    getFirestoreStrategies()
      .then((fsStrategies) => {
        const mapped =
          fsStrategies.length > 0 ? firestoreToLocal(fsStrategies) : cached;
        finishHydration(mapped);
      })
      .catch((e) => {
        console.error("Failed to load strategies from Firestore, using cache:", e);
        finishHydration(cached);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist strategies whenever they change (after hydration)
  useEffect(() => {
    if (!mounted || hydratingRef.current) return;
    persistStrategies(activeStrategies);
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

    if (symbols.length > 1) {
      const presetUniverse =
        symbols.length === NIFTY50_SYMBOLS.length &&
        symbols.every((s, i) => s === NIFTY50_SYMBOLS[i])
          ? ("nifty50" as const)
          : ("custom" as const);
      const newStrategy: ActiveStrategy = {
        id: `active-${Date.now()}-universe`,
        name: def.name,
        type: modalType,
        symbol: symbols[0],
        symbols,
        universe: presetUniverse,
        exchange: "NSE",
        mode: modalPaper ? "paper" : "live",
        status: "running",
        signals: 0,
        pnl: 0,
        params: { ...modalParams },
        timeframe: modalTimeframe,
        createdAt: new Date().toISOString(),
      };
      setActiveStrategies((prev) => [...prev, newStrategy]);
      setModalOpen(false);
      return;
    }

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
  const totalPnl = paperTotalPnl ?? 0;
  const runningCount = activeStrategies.filter((s) => s.status === "running").length;

  useEffect(() => {
    async function loadPaperPnl() {
      try {
        const [paper, settings] = await Promise.all([
          getPaperTradingState(),
          getSettings(),
        ]);
        const trades = normalizePaperTrades(paper.trades ?? []);
        const starting = resolvePaperStartingBalance(settings);
        const breakdown = computePnlBreakdown(
          trades,
          paper.holdings,
          paper.balance,
          starting
        );
        setPaperTotalPnl(breakdown.allTimePnl);
      } catch {
        setPaperTotalPnl(null);
      }
    }
    void loadPaperPnl();
    const onPaperUpdate = () => void loadPaperPnl();
    window.addEventListener("paper-trading-updated", onPaperUpdate);
    return () => window.removeEventListener("paper-trading-updated", onPaperUpdate);
  }, []);

  useEffect(() => {
    async function loadRunnerMeta() {
      const meta = await getStrategyRunnerMeta();
      if (meta.lastRunAt) {
        setLastRunnerAt(meta.lastRunAt);
        localStorage.setItem("strategy_runner_last_run", meta.lastRunAt);
      } else {
        const stored = localStorage.getItem("strategy_runner_last_run");
        if (stored) setLastRunnerAt(stored);
      }
      if (meta.lastCronAt) {
        setLastCronAt(meta.lastCronAt);
      }
      if (meta.lastScanSummary) {
        setLastScanSummary(meta.lastScanSummary);
        setScanFeedback(formatScanFeedback(meta.lastScanSummary));
      }
    }
    void loadRunnerMeta();

    const onUpdate = () => {
      void loadRunnerMeta();
      getFirestoreStrategies().then((fs) => {
        setActiveStrategies(firestoreToLocal(fs));
      });
    };
    window.addEventListener("strategies-updated", onUpdate);
    return () => window.removeEventListener("strategies-updated", onUpdate);
  }, []);

  const handleRunScanNow = async () => {
    setIsScanning(true);
    setScanFeedback(null);
    try {
      const { getAuth } = await import("firebase/auth");
      const { app } = await import("@/lib/firebase");
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        window.dispatchEvent(new CustomEvent("strategy-runner-force"));
        return;
      }

      const res = await fetch("/api/strategies/execute", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok !== false) {
        const now = (data.ranAt as string) ?? new Date().toISOString();
        localStorage.setItem("strategy_runner_last_run", now);
        setLastRunnerAt(now);
        const summary = {
          ranAt: now,
          scanned: Number(data.scanned ?? 0),
          signalsFound: Number(data.signalsFound ?? 0),
          tradesExecuted: Number(data.tradesExecuted ?? 0),
          diagnostics: data.diagnostics as StrategyRunnerMeta["lastScanSummary"] extends {
            diagnostics?: infer D;
          }
            ? D
            : undefined,
        };
        setLastScanSummary(summary);
        setScanFeedback(
          summary.tradesExecuted === 0 && summary.signalsFound > 0
            ? formatScanFeedback(summary)
            : `Scan complete: ${summary.signalsFound} signal${summary.signalsFound !== 1 ? "s" : ""}, ${summary.tradesExecuted} trade${summary.tradesExecuted !== 1 ? "s" : ""} placed.`
        );
        window.dispatchEvent(new CustomEvent("strategies-updated"));
        window.dispatchEvent(new CustomEvent("paper-trading-updated"));
        getFirestoreStrategies().then((fs) => setActiveStrategies(firestoreToLocal(fs)));
      } else {
        const msg =
          (data.error as string) ??
          "Scan failed — check Audit logs or server configuration.";
        setScanFeedback(msg);
        window.dispatchEvent(new CustomEvent("strategy-runner-force"));
      }
    } finally {
      setIsScanning(false);
    }
  };

  const filteredDefinitions = STRATEGY_DEFINITIONS.filter((d) =>
    categoryFilter === "all" ? true : d.category === categoryFilter
  );

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-text-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Loading strategies…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Trading Strategies</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Configure and manage your algorithmic trading strategies
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSection("backtest")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
              pageSection === "backtest"
                ? "border-accent bg-accent-muted text-brand"
                : "border-border bg-bg-secondary text-text-secondary hover:border-accent/40"
            )}
          >
            <BarChart3 className="h-4 w-4" />
            Backtest
          </button>
          <button
            type="button"
            onClick={() => setSection("audit")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
              pageSection === "audit"
                ? "border-accent bg-accent-muted text-brand"
                : "border-border bg-bg-secondary text-text-secondary hover:border-accent/40"
            )}
          >
            <ScrollText className="h-4 w-4" />
            Audit logs
          </button>
          <button
            type="button"
            onClick={handleRunScanNow}
            disabled={isScanning || runningCount === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-600/50 bg-emerald-600/10 px-4 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20 disabled:opacity-50"
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run scan now
          </button>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 rounded-xl bg-accent text-brand px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Create Strategy
          </button>
        </div>
      </div>

      <StrategiesSectionNav
        active={pageSection}
        onChange={setSection}
        activeCount={activeStrategies.length}
        runningCount={runningCount}
      />

      {pageSection === "backtest" && (
        <div className="space-y-4">
          <BacktestPanel />
        </div>
      )}

      {pageSection === "audit" && (
        <div className="space-y-4">
          <LastScanPanel summary={lastScanSummary ?? null} />
          <TradeAuditPanel />
          <AuditLogsPanel tall />
        </div>
      )}

      {pageSection === "active" && (
        <div className="space-y-4">
          {/* Active Strategies Table — dedicated tab */}
          <div className="rounded-xl border border-border bg-bg-secondary">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-text-primary">Active Strategies</h2>
              <span className="rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
                {runningCount} running
              </span>
            </div>

            {activeStrategies.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-text-tertiary">
                No active strategies. Switch to{" "}
                <button
                  type="button"
                  onClick={() => setSection("configure")}
                  className="text-accent font-medium hover:underline"
                >
                  Configure
                </button>{" "}
                to activate one.
              </div>
            ) : (
              <ActiveStrategiesTable
                activeStrategies={activeStrategies}
                onToggleStatus={toggleStrategyStatus}
                onStop={stopStrategy}
              />
            )}
          </div>
        </div>
      )}

      {pageSection === "configure" && (
        <>
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 mb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-secondary">
            <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400 mr-1 -mt-0.5" />
            Auto scans every <strong className="text-text-primary">15 min</strong> (NSE hours).
            {lastCronAt && (
              <span className="text-emerald-400/90 ml-2">
                Last cron:{" "}
                {new Date(lastCronAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}{" "}
                IST
              </span>
            )}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium",
              runningCount > 0
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-300"
            )}
          >
            {runningCount > 0
              ? `${runningCount} running`
              : "Start a strategy to enable scans"}
          </span>
        </div>
      </div>
      <LastScanPanel summary={lastScanSummary ?? null} className="mb-2" />

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "basic", "advanced"] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-medium transition-colors",
              categoryFilter === cat
                ? "bg-accent text-brand"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-hover"
            )}
          >
            {cat === "all" ? "All strategies" : cat === "basic" ? "Basic (5)" : "Advanced (7)"}
          </button>
        ))}
        <p className="text-[10px] text-text-tertiary ml-1 w-full sm:w-auto">
          Win rates are historical backtest benchmarks — not guaranteed future performance.
        </p>
      </div>

      {/* Strategy types — compact list */}
      <div className="rounded-xl border border-border bg-bg-secondary divide-y divide-border">
        {filteredDefinitions.map((def) => {
          const state = cardState[def.id];
          const Icon = def.icon;
          const expanded = expandedCard === def.id;
          return (
            <div key={def.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    state.active ? "bg-accent/25 text-accent" : "bg-bg-tertiary text-text-secondary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">{def.name}</h3>
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase",
                        def.category === "advanced" ? "text-purple-400" : "text-text-tertiary"
                      )}
                    >
                      {def.category}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {def.winRate}% win · {def.riskLevel} risk
                    </span>
                  </div>
                  <p className="text-xs text-text-tertiary line-clamp-2 sm:line-clamp-1">{def.description}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex h-2 w-2 shrink-0 rounded-full",
                    state.active ? "bg-profit" : "bg-border-light"
                  )}
                  title={state.active ? "Active" : "Inactive"}
                />
                <button
                  type="button"
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
                    "shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium",
                    state.paperTrading
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-red-500/10 text-red-400"
                  )}
                >
                  {state.paperTrading ? "Paper" : "Live"}
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedCard(expanded ? null : def.id)}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] text-text-secondary hover:bg-bg-tertiary"
                >
                  {expanded ? "Hide" : "Configure"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCardActive(def.id)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1 text-[10px] font-semibold",
                    state.active
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-accent text-brand"
                  )}
                >
                  {state.active ? "On" : "Activate"}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {def.params.map((p) => (
                      <div key={p.key}>
                        <label className="mb-0.5 block text-[10px] text-text-tertiary">
                          {p.label}
                        </label>
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
                          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-0.5 block text-[10px] text-text-tertiary">
                        Symbols
                      </label>
                      <input
                        type="text"
                        value={state.symbols}
                        onChange={(e) =>
                          setCardState((prev) => ({
                            ...prev,
                            [def.id]: { ...prev[def.id], symbols: e.target.value },
                          }))
                        }
                        className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-xs uppercase text-text-primary outline-none focus:border-accent"
                      />
                    </div>
                    <div className="w-28">
                      <label className="mb-0.5 block text-[10px] text-text-tertiary">
                        Timeframe
                      </label>
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
                        className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                      >
                        {TIMEFRAMES.map((tf) => (
                          <option key={tf} value={tf}>
                            {tf}
                          </option>
                        ))}
                      </select>
                    </div>
                    {[
                      { label: "Nifty 50", key: "nifty50" },
                      { label: "Bank Nifty", key: "banknifty" },
                      { label: "Top 100", key: "top100" },
                    ].map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyPreset("card", def.id, preset.key)}
                        className="rounded px-2 py-1 text-[10px] font-medium text-accent bg-accent-muted hover:bg-accent-hover/20"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active strategies — quick link */}
      <div className="rounded-xl border border-border bg-bg-secondary px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">Active:</span>{" "}
          {activeStrategies.length === 0
            ? "none"
            : `${runningCount} running · ${activeStrategies.length} total`}
          {activeStrategies.length > 0 && (
            <span className="text-text-tertiary">
              {" "}
              · {formatCurrency(totalPnl)} paper P&amp;L
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setSection("active")}
          className="text-xs font-medium text-accent hover:underline"
        >
          View all →
        </button>
      </div>

        </>
      )}

      {/* Create Strategy Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-brand/25 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-bg-secondary p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Create Strategy
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Strategy type */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Strategy Type
                </label>
                <div className="relative">
                  <select
                    value={modalType}
                    onChange={(e) =>
                      handleModalTypeChange(e.target.value as StrategyType)
                    }
                    className="w-full appearance-none rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                  >
                    {STRATEGY_DEFINITIONS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                </div>
              </div>

              {/* Symbols (multi-symbol) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Symbols (comma-separated)
                </label>
                <input
                  type="text"
                  value={modalSymbols}
                  onChange={(e) => setModalSymbols(e.target.value)}
                  placeholder="RELIANCE, TCS, INFY"
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm uppercase text-text-primary outline-none transition-colors focus:border-accent placeholder:text-text-tertiary placeholder:normal-case"
                />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-text-tertiary">Presets:</span>
                  {[
                    { label: "Nifty 50", key: "nifty50" },
                    { label: "Bank Nifty", key: "banknifty" },
                    { label: "Top 100", key: "top100" },
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset("modal", null, preset.key)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-accent bg-accent-muted hover:bg-accent-hover/20 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {parseSymbols(modalSymbols).length > 1 && (
                  <p className="mt-2 text-[10px] text-text-tertiary rounded-lg border border-border bg-bg-tertiary/30 p-3">
                    Universe mode: one strategy scans all {parseSymbols(modalSymbols).length} symbols.
                    Buys are ranked globally by how many strategy types agree on each symbol;
                    only open position slots are filled each scan (see Settings → max positions).
                  </p>
                )}
              </div>

              {/* Timeframe */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Timeframe
                </label>
                <div className="relative">
                  <select
                    value={modalTimeframe}
                    onChange={(e) =>
                      setModalTimeframe(e.target.value as Timeframe)
                    }
                    className="w-full appearance-none rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                  >
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                </div>
              </div>

              {/* Dynamic params */}
              <div>
                <span className="mb-2 block text-sm font-medium text-text-secondary">
                  Parameters
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {getStrategyDef(modalType).params.map((p) => (
                    <div key={p.key}>
                      <label className="mb-1 block text-xs text-text-tertiary">
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
                        className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Paper / Live */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-bg-tertiary px-4 py-3">
                <span className="text-sm text-text-secondary">Trading Mode</span>
                <button
                  onClick={() => setModalPaper((p) => !p)}
                  className="relative inline-flex h-7 w-[120px] items-center rounded-full bg-bg-tertiary p-0.5"
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
                      modalPaper ? "text-amber-300" : "text-text-tertiary"
                    )}
                  >
                    Paper
                  </span>
                  <span
                    className={cn(
                      "relative z-10 w-1/2 text-center text-xs font-medium transition-colors",
                      !modalPaper ? "text-red-300" : "text-text-tertiary"
                    )}
                  >
                    Live
                  </span>
                </button>
              </div>

              {/* Save */}
              <button
                onClick={handleModalSave}
                className="w-full rounded-xl bg-accent text-brand py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-accent-hover"
              >
                Save &amp; Activate
                {parseSymbols(modalSymbols).length > 1 && (
                  <span className="ml-1 text-text-secondary">
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

export default function StrategiesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-text-secondary">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm">Loading strategies…</p>
        </div>
      }
    >
      <StrategiesPageContent />
    </Suspense>
  );
}
