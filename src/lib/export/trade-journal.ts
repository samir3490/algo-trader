import type { PaperTrade } from "@/lib/firebase";
import type { PaperPosition } from "@/lib/portfolio/types";
import { enrichTradesWithStrategy } from "@/lib/strategies/strategy-performance";
import { formatTradeDateTime, tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { rowsToCsv } from "./csv";

export interface TradeJournalRow {
  id: string;
  dateTimeIST: string;
  symbol: string;
  exchange: string;
  side: string;
  qty: number;
  price: number;
  strategyName: string;
  allStrategies: string;
  signalStrength: string;
  reason: string;
  exitReason: string;
  netPnl: string;
  charges: string;
  positionState: string;
  monthIST: string;
}

function strengthLabel(count?: number): string {
  if (!count || count <= 0) return "";
  if (count >= 5) return `Strong · ${count}`;
  if (count >= 3) return `Moderate · ${count}`;
  if (count >= 2) return `Light · ${count}`;
  return `Single · ${count}`;
}

function monthIST(ms: number): string {
  if (ms <= 0) return "";
  return new Date(ms).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  });
}

export function buildTradeJournalRows(
  trades: PaperTrade[],
  positions?: PaperPosition[]
): TradeJournalRow[] {
  const openSymbols = new Set(
    (positions ?? [])
      .filter((p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT")
      .map((p) => `${p.symbol}:${p.exchange}`)
  );

  return enrichTradesWithStrategy(trades)
    .sort((a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b))
    .map((t) => {
      const ms = tradeExecutedAtMs(t);
      const symKey = `${t.symbol}:${t.exchange}`;
      const posState = openSymbols.has(symKey)
        ? "open"
        : t.side === "BUY"
          ? "closed"
          : "exit";
      const names = t.displayStrategyNames?.length
        ? t.displayStrategyNames.join("; ")
        : t.displayStrategyName;
      return {
        id: t.id,
        dateTimeIST: formatTradeDateTime(t),
        symbol: t.symbol,
        exchange: t.exchange,
        side: t.side,
        qty: t.qty,
        price: t.price,
        strategyName: t.displayStrategyName,
        allStrategies: names,
        signalStrength: strengthLabel(t.buySignalCount),
        reason: t.reason ?? "",
        exitReason: t.exitReason ?? "",
        netPnl: t.netPnl != null ? String(t.netPnl) : "",
        charges: t.charges != null ? String(t.charges) : "",
        positionState: posState,
        monthIST: monthIST(ms),
      };
    });
}

export function buildTradeJournalCsv(
  trades: PaperTrade[],
  positions?: PaperPosition[]
): string {
  const rows = buildTradeJournalRows(trades, positions);
  return rowsToCsv(
    [
      "id",
      "dateTimeIST",
      "symbol",
      "exchange",
      "side",
      "qty",
      "price",
      "strategyName",
      "allStrategies",
      "signalStrength",
      "reason",
      "exitReason",
      "netPnl",
      "charges",
      "positionState",
      "monthIST",
    ],
    rows.map((r) => [
      r.id,
      r.dateTimeIST,
      r.symbol,
      r.exchange,
      r.side,
      r.qty,
      r.price,
      r.strategyName,
      r.allStrategies,
      r.signalStrength,
      r.reason,
      r.exitReason,
      r.netPnl,
      r.charges,
      r.positionState,
      r.monthIST,
    ])
  );
}
