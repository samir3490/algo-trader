"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { isMarketOpen } from "@/lib/utils";
import { app } from "@/lib/firebase";

const RUN_INTERVAL_MS = 15 * 60 * 1000;
const STORAGE_LAST_RUN = "strategy_runner_last_run";

async function executeOnServer(): Promise<boolean> {
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) return false;

  const token = await user.getIdToken();
  const res = await fetch("/api/strategies/execute", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error("Strategy execute failed:", await res.text());
    return false;
  }

  const ranAt = new Date().toISOString();
  localStorage.setItem(STORAGE_LAST_RUN, ranAt);
  window.dispatchEvent(new CustomEvent("strategies-updated"));
  window.dispatchEvent(new CustomEvent("paper-trading-updated"));
  return true;
}

export default function StrategyRunner() {
  const { user, loading } = useAuth();
  const runningRef = useRef(false);

  const runStrategies = useCallback(async () => {
    if (runningRef.current || !user) return;
    runningRef.current = true;
    try {
      await executeOnServer();
    } catch (e) {
      console.error("Strategy runner error:", e);
    } finally {
      runningRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    const onForce = () => runStrategies();
    window.addEventListener("strategy-runner-force", onForce);
    return () => window.removeEventListener("strategy-runner-force", onForce);
  }, [runStrategies]);

  useEffect(() => {
    if (loading || !user) return;

    const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const day = ist.getDay();
    if (day === 0 || day === 6) return;

    const last = localStorage.getItem(STORAGE_LAST_RUN);
    const lastMs = last ? new Date(last).getTime() : 0;
    if (Date.now() - lastMs >= RUN_INTERVAL_MS || lastMs === 0) {
      runStrategies();
    }

    const interval = setInterval(() => {
      if (isMarketOpen()) runStrategies();
    }, RUN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user, loading, runStrategies]);

  return null;
}
