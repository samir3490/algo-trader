"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Link2,
  BrainCircuit,
  Wallet,
  Radio,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getActiveStrategies,
  getPaperTradingState,
  getSettings,
  getZerodhaAccounts,
} from "@/lib/firebase";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/button";

const DISMISS_KEY = "algo_onboarding_dismissed";

interface ChecklistState {
  connected: boolean;
  hasBalance: boolean;
  hasStrategy: boolean;
  liveReady: boolean;
  loading: boolean;
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [state, setState] = useState<ChecklistState>({
    connected: false,
    hasBalance: false,
    hasStrategy: false,
    liveReady: false,
    loading: true,
  });

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        const [accounts, settings, paper, strategies] = await Promise.all([
          getZerodhaAccounts(),
          getSettings(),
          getPaperTradingState(),
          getActiveStrategies(),
        ]);
        if (cancelled) return;
        const connected = accounts.length > 0;
        setState({
          connected,
          hasBalance: (paper?.balance ?? settings.paperStartingBalance ?? 0) > 0,
          hasStrategy: strategies.length > 0,
          liveReady: connected && settings.liveAutoTradingEnabled === true,
          loading: false,
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (dismissed || state.loading) return null;

  const items = [
    {
      id: "connect",
      done: state.connected,
      label: "Connect Zerodha",
      hint: "Live prices & live orders",
      href: "/settings?tab=live",
      icon: Link2,
    },
    {
      id: "balance",
      done: state.hasBalance,
      label: "Paper balance ready",
      hint: "Simulated cash for practice",
      href: "/paper-trading",
      icon: Wallet,
    },
    {
      id: "strategy",
      done: state.hasStrategy,
      label: "Enable a strategy",
      hint: "Auto-scan needs at least one",
      href: "/strategies",
      icon: BrainCircuit,
    },
    {
      id: "live",
      done: state.liveReady,
      label: "Review live kill switch",
      hint: "Keep OFF until you are ready",
      href: "/live-trading",
      icon: Radio,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <section className="rounded-xl border border-accent/30 bg-accent-muted/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="type-label text-brand-muted">Getting started</p>
          <h2 className="type-title text-text-primary mt-0.5">
            Set up AlgoTrader ({doneCount}/{items.length})
          </h2>
          <p className="type-caption text-text-secondary mt-1">
            Complete these once — most trading happens from your phone.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-2 rounded-lg text-text-tertiary hover:bg-bg-hover touch-manipulation"
          aria-label="Dismiss checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-3 min-h-[52px] transition-colors touch-manipulation",
                  item.done
                    ? "border-profit/20 bg-profit-muted/40"
                    : "border-border bg-bg-secondary hover:bg-bg-hover"
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-profit shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-text-tertiary shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{item.label}</p>
                  <p className="text-[11px] text-text-tertiary">{item.hint}</p>
                </div>
                <Icon className="h-4 w-4 text-text-tertiary shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Skip for now
        </Button>
      </div>
    </section>
  );
}
