"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { app } from "@/lib/firebase";

const STORAGE_LAST_RUN = "strategy_runner_last_run";

/** Manual trigger — automatic scans every 15 min via GitHub Actions (see docs/SERVER-STRATEGY-CRON.md). */
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

  localStorage.setItem(STORAGE_LAST_RUN, new Date().toISOString());
  window.dispatchEvent(new CustomEvent("strategies-updated"));
  window.dispatchEvent(new CustomEvent("paper-trading-updated"));
  return true;
}

export default function StrategyRunner() {
  const { user } = useAuth();
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

  return null;
}
