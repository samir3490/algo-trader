import type { OrderRecord, PaperTradingState } from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { ensurePositions, withSyncedHoldings } from "./position-manager";
import { prunePaperStateForScan } from "./paper-state-cleanup";
import { syncHoldingsFromPositions } from "./sync-holdings";

export type ReconcileSeverity = "info" | "warning" | "error";

export interface ReconcileIssue {
  code: string;
  severity: ReconcileSeverity;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface ReconcileResult {
  issues: ReconcileIssue[];
  fixed: boolean;
  changes: string[];
  state: PaperTradingState;
}

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function holdingKey(h: { symbol: string; exchange: string }): string {
  return symKey(h.symbol, h.exchange);
}

/** Detect drift between holdings, positions, and trades without mutating state. */
export function detectPaperStateIssues(
  raw: PaperTradingState,
  orders: OrderRecord[] = []
): ReconcileIssue[] {
  const issues: ReconcileIssue[] = [];
  const withPos = ensurePositions(raw);
  const positions = withPos.positions ?? [];
  const holdings = raw.holdings ?? [];
  const expectedHoldings = syncHoldingsFromPositions(positions);

  const expectedByKey = new Map(
    expectedHoldings.map((h) => [holdingKey(h), h])
  );
  const actualByKey = new Map(holdings.map((h) => [holdingKey(h), h]));

  for (const [key, expected] of expectedByKey) {
    const actual = actualByKey.get(key);
    if (!actual) {
      issues.push({
        code: "holdings_missing",
        severity: "error",
        message: `Holdings missing row for ${key}`,
        details: { expectedQty: expected.qty },
      });
      continue;
    }
    if (actual.qty !== expected.qty) {
      issues.push({
        code: "holdings_qty_mismatch",
        severity: "error",
        message: `${key} qty mismatch: holdings ${actual.qty} vs positions ${expected.qty}`,
        details: { holdingsQty: actual.qty, positionsQty: expected.qty },
      });
    }
    if (Math.abs(actual.avgPrice - expected.avgPrice) > 0.02) {
      issues.push({
        code: "holdings_avg_mismatch",
        severity: "warning",
        message: `${key} avg price mismatch`,
        details: {
          holdingsAvg: actual.avgPrice,
          positionsAvg: expected.avgPrice,
        },
      });
    }
  }

  for (const [key, actual] of actualByKey) {
    if (!expectedByKey.has(key) && (actual.qty ?? 0) > 0) {
      issues.push({
        code: "orphan_holding",
        severity: "error",
        message: `Orphan holding ${key} (${actual.qty} shares) with no open position`,
        details: { qty: actual.qty },
      });
    }
  }

  const closedWithQty = positions.filter(
    (p) =>
      (p.state === "CLOSED" || p.state === "CANCELLED") && (p.quantity ?? 0) > 0
  );
  if (closedWithQty.length > 0) {
    issues.push({
      code: "closed_position_has_qty",
      severity: "warning",
      message: `${closedWithQty.length} closed position(s) still have quantity`,
      details: { count: closedWithQty.length },
    });
  }

  const zeroOpen = positions.filter(
    (p) =>
      (p.state === "OPEN" || p.state === "PARTIAL_EXIT") &&
      (p.quantity ?? 0) <= 0
  );
  if (zeroOpen.length > 0) {
    issues.push({
      code: "zero_qty_open_position",
      severity: "warning",
      message: `${zeroOpen.length} open position(s) with zero quantity`,
      details: { count: zeroOpen.length },
    });
  }

  const openCount = positions.filter(
    (p) =>
      (p.state === "OPEN" || p.state === "PARTIAL_EXIT") && (p.quantity ?? 0) > 0
  ).length;
  const holdingCount = holdings.filter((h) => (h.qty ?? 0) > 0).length;
  if (openCount !== holdingCount) {
    issues.push({
      code: "open_count_mismatch",
      severity: "error",
      message: `Open positions (${openCount}) ≠ holdings rows (${holdingCount})`,
    });
  }

  const rawTrades = raw.trades ?? [];
  const normalized = normalizePaperTrades(rawTrades, orders);
  if (normalized.length !== rawTrades.length) {
    issues.push({
      code: "duplicate_trades",
      severity: "warning",
      message: `Trade list has duplicates (${rawTrades.length} → ${normalized.length} after dedupe)`,
      details: { before: rawTrades.length, after: normalized.length },
    });
  }

  const balance = raw.balance ?? withPos.balance ?? 0;
  if (balance < 0 && openCount === 0) {
    issues.push({
      code: "negative_balance_flat",
      severity: "warning",
      message: "Negative balance with no open positions",
      details: { balance },
    });
  }

  return issues;
}

/** Repair holdings ↔ positions sync and prune invalid rows. */
export function reconcilePaperState(
  raw: PaperTradingState,
  orders: OrderRecord[] = []
): ReconcileResult {
  const issues = detectPaperStateIssues(raw, orders);
  const changes: string[] = [];
  let state = ensurePositions(raw);

  const beforePositions = state.positions?.length ?? 0;
  state = prunePaperStateForScan(state);
  const afterPositions = state.positions?.length ?? 0;
  if (afterPositions < beforePositions) {
    changes.push(`Removed ${beforePositions - afterPositions} stale position row(s)`);
  }

  const beforeHoldings = state.holdings?.length ?? 0;
  state = withSyncedHoldings(state);
  const afterHoldings = state.holdings?.length ?? 0;
  if (beforeHoldings !== afterHoldings) {
    changes.push("Rebuilt holdings from open positions");
  } else {
    const synced = syncHoldingsFromPositions(state.positions ?? []);
    const drift = (state.holdings ?? []).some((h) => {
      const exp = synced.find((s) => holdingKey(s) === holdingKey(h));
      return !exp || exp.qty !== h.qty || Math.abs(exp.avgPrice - h.avgPrice) > 0.02;
    });
    if (drift) {
      changes.push("Synced holdings quantities/avg from positions");
    }
  }

  const rawTrades = state.trades ?? [];
  const normalized = normalizePaperTrades(rawTrades, orders);
  if (normalized.length !== rawTrades.length) {
    state = { ...state, trades: normalized };
    changes.push(`Deduped trades (${rawTrades.length} → ${normalized.length})`);
  }

  const afterIssues = detectPaperStateIssues(state, orders);
  const fixed =
    changes.length > 0 &&
    afterIssues.filter((i) => i.severity === "error").length <
      issues.filter((i) => i.severity === "error").length;

  return {
    issues: afterIssues.length > 0 ? afterIssues : issues,
    fixed: fixed || (changes.length > 0 && afterIssues.length < issues.length),
    changes,
    state,
  };
}
