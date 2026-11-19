import type { TradeAuditEntry } from "@/lib/portfolio/types";
import { rowsToCsv } from "./csv";

export function buildTradeAuditCsv(rows: TradeAuditEntry[]): string {
  return rowsToCsv(
    [
      "id",
      "executedAt",
      "mode",
      "strategyName",
      "symbol",
      "exchange",
      "side",
      "qty",
      "signalReason",
      "signalStrength",
      "entryTime",
      "entryPrice",
      "exitTime",
      "exitPrice",
      "exitReason",
      "netPnl",
    ],
    rows.map((r) => [
      r.id,
      r.executedAt ?? "",
      r.mode,
      r.strategyName,
      r.symbol,
      r.exchange,
      r.side,
      r.qty,
      r.signalReason ?? "",
      r.signalStrength ?? "",
      r.entryTime ?? "",
      r.entryPrice ?? "",
      r.exitTime ?? "",
      r.exitPrice ?? "",
      r.exitReason ?? "",
      r.netPnl ?? "",
    ])
  );
}
