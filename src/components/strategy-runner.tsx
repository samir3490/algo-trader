"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { isMarketOpen } from "@/lib/utils";
import {
  getActiveStrategies,
  saveActiveStrategies,
  getPaperTradingState,
  savePaperTradingState,
  type ActiveStrategy,
} from "@/lib/firebase";
import { inferStrategyType } from "@/lib/strategies/definitions";
import { applyPaperSignal } from "@/lib/strategies/execute-paper";
import type { StrategySignal } from "@/types";

const RUN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const STORAGE_LAST_RUN = "strategy_runner_last_run";
const STORAGE_SIGNAL_KEYS = "strategy_runner_signal_keys";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function signalDedupeKey(strategyId: string, action: string): string {
  return `${strategyId}:${action}:${todayKey()}`;
}

function loadDedupeKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_SIGNAL_KEYS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter((k) => k.endsWith(todayKey())));
  } catch {
    return new Set();
  }
}

function saveDedupeKeys(keys: Set<string>) {
  localStorage.setItem(STORAGE_SIGNAL_KEYS, JSON.stringify([...keys]));
}

export default function StrategyRunner() {
  const { user, loading } = useAuth();
  const runningRef = useRef(false);

  const runStrategies = useCallback(async () => {
    if (runningRef.current || !user) return;
    runningRef.current = true;

    try {
      const strategies = await getActiveStrategies();
      const running = strategies.filter((s) => s.status === "running");
      if (running.length === 0) {
        localStorage.setItem(STORAGE_LAST_RUN, new Date().toISOString());
        return;
      }

      const payload = running.map((s) => ({
        ...s,
        type: inferStrategyType(s.name),
      }));

      const res = await fetch("/api/strategies/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategies: payload }),
      });

      if (!res.ok) {
        console.error("Strategy scan failed:", await res.text());
        return;
      }

      const data = await res.json();
      const signals: Array<{
        strategyId: string;
        symbol: string;
        action: string;
        price: number;
        reason: string;
      }> = data.signals ?? [];

      if (signals.length === 0) {
        localStorage.setItem(STORAGE_LAST_RUN, new Date().toISOString());
        await updateStrategiesAfterRun(strategies, []);
        return;
      }

      const dedupe = loadDedupeKeys();
      let paperState = await getPaperTradingState();
      const executed: string[] = [];

      for (const sig of signals) {
        const key = signalDedupeKey(sig.strategyId, sig.action);
        if (dedupe.has(key)) continue;

        const strat = running.find((s) => s.id === sig.strategyId);
        if (!strat) continue;

        if (strat.mode === "paper" && (sig.action === "BUY" || sig.action === "SELL")) {
          const signal: StrategySignal = {
            symbol: sig.symbol,
            action: sig.action as "BUY" | "SELL",
            price: sig.price,
            quantity: strat.params?.quantity ?? 1,
            reason: sig.reason,
            confidence: 0.7,
            timestamp: new Date(),
          };
          const { state, executed: didExec } = applyPaperSignal(
            paperState,
            signal,
            strat.exchange || "NSE"
          );
          if (didExec) {
            paperState = state;
            dedupe.add(key);
            executed.push(sig.strategyId);
          }
        }
        // Live mode: log only — user must enable live auto-trading separately
      }

      if (executed.length > 0) {
        await savePaperTradingState(paperState);
        localStorage.setItem("paper_trading_state", JSON.stringify(paperState));
        window.dispatchEvent(new CustomEvent("paper-trading-updated"));
      }

      saveDedupeKeys(dedupe);
      localStorage.setItem(STORAGE_LAST_RUN, new Date().toISOString());
      await updateStrategiesAfterRun(strategies, signals);
    } catch (e) {
      console.error("Strategy runner error:", e);
    } finally {
      runningRef.current = false;
    }
  }, [user]);

  async function updateStrategiesAfterRun(
    all: ActiveStrategy[],
    signals: Array<{ strategyId: string }>
  ) {
    const signalIds = new Set(signals.map((s) => s.strategyId));
    const updated = all.map((s) => {
      if (signalIds.has(s.id)) {
        return {
          ...s,
          signals: (s.signals ?? 0) + 1,
          lastRunAt: new Date().toISOString(),
        };
      }
      if (s.status === "running") {
        return { ...s, lastRunAt: new Date().toISOString() };
      }
      return s;
    });
    await saveActiveStrategies(updated);
    localStorage.setItem("activeStrategies", JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("strategies-updated"));
  }

  useEffect(() => {
    const onForce = () => runStrategies();
    window.addEventListener("strategy-runner-force", onForce);
    return () => window.removeEventListener("strategy-runner-force", onForce);
  }, [runStrategies]);

  useEffect(() => {
    if (loading || !user) return;

    const isWeekday = () => {
      const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const d = ist.getDay();
      return d >= 1 && d <= 5;
    };

    if (!isWeekday()) return;

    const last = localStorage.getItem(STORAGE_LAST_RUN);
    const lastMs = last ? new Date(last).getTime() : 0;
    const elapsed = Date.now() - lastMs;
    if (elapsed >= RUN_INTERVAL_MS || elapsed === 0) {
      runStrategies();
    }

    const interval = setInterval(() => {
      if (isMarketOpen()) {
        runStrategies();
      }
    }, RUN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user, loading, runStrategies]);

  return null;
}
