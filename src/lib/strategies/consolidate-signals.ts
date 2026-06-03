import type { PaperHolding } from "@/lib/firebase";
import type { ActiveStrategy } from "@/lib/firebase";
import type { ScanSignal } from "@/lib/strategies/scan-signals";

function normSymbol(s: string): string {
  return s.trim().toUpperCase();
}

function normExchange(ex: string): string {
  return (ex || "NSE").trim().toUpperCase();
}

function findHolding(
  holdings: PaperHolding[],
  symbol: string,
  exchange: string
): PaperHolding | undefined {
  const sym = normSymbol(symbol);
  const ex = normExchange(exchange);
  return holdings.find(
    (h) => normSymbol(h.symbol) === sym && normExchange(h.exchange) === ex
  );
}

function pickStrongest(signals: ScanSignal[]): ScanSignal {
  return signals.reduce((best, s) =>
    (s.confidence ?? 0) >= (best.confidence ?? 0) ? s : best
  );
}

/**
 * When many strategies run on the same symbol (e.g. Nifty 50 list), only one
 * trade per symbol per scan — avoids HAL bought & sold at the same price in one run.
 */
export function consolidateSignalsForExecution(
  signals: ScanSignal[],
  running: ActiveStrategy[],
  holdings: PaperHolding[]
): ScanSignal[] {
  const bySymbol = new Map<string, ScanSignal[]>();

  for (const sig of signals) {
    const strat = running.find((s) => s.id === sig.strategyId);
    const ex = normExchange(strat?.exchange || "NSE");
    const key = `${normSymbol(sig.symbol)}:${ex}`;
    const list = bySymbol.get(key) ?? [];
    list.push(sig);
    bySymbol.set(key, list);
  }

  const result: ScanSignal[] = [];

  for (const [key, group] of bySymbol) {
    const [sym, ex] = key.split(":");
    const holding = findHolding(holdings, sym, ex);
    const hasPosition = (holding?.qty ?? 0) > 0;
    const buys = group.filter((s) => s.action === "BUY");
    const sells = group.filter((s) => s.action === "SELL");

    let chosen: ScanSignal | null = null;

    if (buys.length > 0 && sells.length > 0) {
      // Conflicting signals from different strategies — pick one sensible action
      chosen = hasPosition ? pickStrongest(sells) : pickStrongest(buys);
    } else if (sells.length > 0 && hasPosition) {
      chosen = pickStrongest(sells);
    } else if (buys.length > 0 && !hasPosition) {
      chosen = pickStrongest(buys);
    }
    // Skip: SELL with no position, BUY when already holding (no add-to-position auto-trade)

    if (chosen) result.push(chosen);
  }

  // Execute exits before new entries when both symbols appear in one batch
  return result.sort((a, b) => {
    if (a.action === "SELL" && b.action === "BUY") return -1;
    if (a.action === "BUY" && b.action === "SELL") return 1;
    return 0;
  });
}
