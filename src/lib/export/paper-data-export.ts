import type {
  OrderRecord,
  PaperHolding,
  PaperTrade,
} from "@/lib/firebase";
import type { PaperPosition } from "@/lib/portfolio/types";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import {
  computeStrategyPerformance,
  enrichTradesWithStrategy,
} from "@/lib/strategies/strategy-performance";
import { formatTradeDateTime } from "@/lib/paper-trades/normalize";
import { downloadCsv, exportDateStamp, rowsToCsv } from "./csv";

export type PaperExportKind =
  | "trades"
  | "holdings"
  | "positions"
  | "orders"
  | "summary"
  | "strategy-pnl"
  | "all";

export interface PaperExportInput {
  trades: PaperTrade[];
  holdings: PaperHolding[];
  positions?: PaperPosition[];
  orders: OrderRecord[];
  balance: number;
  startingBalance: number;
  exportedAt?: string;
}

function num(n: number | undefined): number | "" {
  return n == null || Number.isNaN(n) ? "" : n;
}

export function buildTradesCsv(input: PaperExportInput): string {
  const enriched = enrichTradesWithStrategy(input.trades);
  return rowsToCsv(
    [
      "id",
      "dateTimeIST",
      "symbol",
      "exchange",
      "side",
      "qty",
      "price",
      "grossAmount",
      "strategyName",
      "strategyId",
      "reason",
      "product",
      "brokerage",
      "stt",
      "gst",
      "charges",
      "netPnl",
      "exitReason",
      "buySignalCount",
    ],
    enriched.map((t) => [
      t.id,
      formatTradeDateTime(t),
      t.symbol,
      t.exchange,
      t.side,
      t.qty,
      t.price,
      t.qty * t.price,
      t.displayStrategyName,
      t.displayStrategyId ?? t.strategyId ?? t.ownerStrategyId,
      t.reason,
      t.product,
      num(t.brokerage),
      num(t.stt),
      num(t.gst),
      num(t.charges),
      num(t.netPnl),
      t.exitReason,
      t.buySignalCount,
    ])
  );
}

export function buildHoldingsCsv(input: PaperExportInput): string {
  return rowsToCsv(
    [
      "symbol",
      "exchange",
      "qty",
      "avgPrice",
      "ltp",
      "investedValue",
      "currentValue",
      "unrealizedPnl",
      "unrealizedPnlPct",
      "ownerStrategyName",
      "ownerStrategyId",
      "buySignalCount",
    ],
    input.holdings.map((h) => {
      const invested = h.avgPrice * h.qty;
      const current = h.ltp * h.qty;
      const pnl = current - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return [
        h.symbol,
        h.exchange,
        h.qty,
        h.avgPrice,
        h.ltp,
        invested,
        current,
        pnl,
        pnlPct,
        h.ownerStrategyName,
        h.ownerStrategyId,
        h.buySignalCount,
      ];
    })
  );
}

export function buildPositionsCsv(input: PaperExportInput): string {
  const positions = input.positions ?? [];
  return rowsToCsv(
    [
      "id",
      "symbol",
      "exchange",
      "state",
      "quantity",
      "entryPrice",
      "ltp",
      "entryTime",
      "ownerStrategyName",
      "ownerStrategyId",
      "stopLoss",
      "target",
      "product",
      "buySignalCount",
      "signalReason",
      "exitTime",
      "exitPrice",
      "exitReason",
    ],
    positions.map((p) => [
      p.id,
      p.symbol,
      p.exchange,
      p.state,
      p.quantity,
      p.entryPrice,
      p.ltp,
      p.entryTime,
      p.ownerStrategyName,
      p.ownerStrategyId,
      num(p.stopLoss),
      num(p.target),
      p.product,
      p.buySignalCount,
      p.signalReason,
      p.exitTime,
      num(p.exitPrice),
      p.exitReason,
    ])
  );
}

export function buildOrdersCsv(input: PaperExportInput): string {
  return rowsToCsv(
    [
      "id",
      "date",
      "time",
      "symbol",
      "exchange",
      "side",
      "qty",
      "price",
      "grossAmount",
      "orderType",
      "product",
      "mode",
      "status",
      "strategyName",
      "strategyId",
      "reason",
      "orderId",
    ],
    input.orders.map((o) => [
      o.id,
      o.date,
      o.time,
      o.symbol,
      o.exchange,
      o.side,
      o.qty,
      o.price,
      o.qty * o.price,
      o.orderType,
      o.product,
      o.mode,
      o.status,
      o.strategyName,
      o.strategyId,
      o.reason,
      o.orderId,
    ])
  );
}

export function buildSummaryCsv(input: PaperExportInput): string {
  const pnl = computePnlBreakdown(
    input.trades,
    input.holdings,
    input.balance,
    input.startingBalance
  );
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  return rowsToCsv(
    ["metric", "value"],
    [
      ["exportedAt", exportedAt],
      ["startingBalance", input.startingBalance],
      ["cashBalance", input.balance],
      ["invested", pnl.portfolio.invested],
      ["portfolioValue", pnl.portfolio.portfolioValue],
      ["unrealizedPnl", pnl.unrealizedPnl],
      ["realizedPnl", pnl.realizedPnl],
      ["allTimePnl", pnl.allTimePnl],
      ["allTimePnlPct", pnl.allTimePnlPercent],
      ["openHoldingsCount", input.holdings.filter((h) => h.qty > 0).length],
      ["openPositionsCount", (input.positions ?? []).filter(
        (p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT"
      ).length],
      ["tradeCount", input.trades.length],
      ["orderCount", input.orders.length],
    ]
  );
}

export function buildStrategyPnlCsv(input: PaperExportInput): string {
  const rows = computeStrategyPerformance(input.trades);
  return rowsToCsv(
    [
      "strategyName",
      "trades",
      "buys",
      "sells",
      "closedRounds",
      "wins",
      "losses",
      "realizedPnl",
    ],
    rows.map((r) => [
      r.strategyName,
      r.trades,
      r.buys,
      r.sells,
      r.closedRounds,
      r.wins,
      r.losses,
      r.realizedPnl,
    ])
  );
}

const BUILDERS: Record<
  Exclude<PaperExportKind, "all">,
  (input: PaperExportInput) => string
> = {
  trades: buildTradesCsv,
  holdings: buildHoldingsCsv,
  positions: buildPositionsCsv,
  orders: buildOrdersCsv,
  summary: buildSummaryCsv,
  "strategy-pnl": buildStrategyPnlCsv,
};

const FILE_LABELS: Record<Exclude<PaperExportKind, "all">, string> = {
  trades: "trades",
  holdings: "holdings",
  positions: "positions",
  orders: "orders",
  summary: "portfolio-summary",
  "strategy-pnl": "strategy-pnl",
};

export function downloadPaperExport(
  kind: PaperExportKind,
  input: PaperExportInput
): void {
  const stamp = exportDateStamp();
  const payload = { ...input, exportedAt: input.exportedAt ?? new Date().toISOString() };

  if (kind === "all") {
    const kinds = Object.keys(BUILDERS) as Exclude<PaperExportKind, "all">[];
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      const csv = BUILDERS[k](payload);
      setTimeout(() => {
        downloadCsv(`algo-trader-${FILE_LABELS[k]}-${stamp}.csv`, csv);
      }, i * 200);
    }
    return;
  }

  downloadCsv(
    `algo-trader-${FILE_LABELS[kind]}-${stamp}.csv`,
    BUILDERS[kind](payload)
  );
}
