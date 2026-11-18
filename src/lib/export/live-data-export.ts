import { downloadCsv, exportDateStamp, rowsToCsv } from "./csv";

export interface LiveExportOrder {
  id: string;
  time: string;
  symbol: string;
  exchange: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  status: string;
  accountId?: string;
  mode?: string;
  strategyName?: string;
  reason?: string;
}

export function buildLiveOrdersCsv(orders: LiveExportOrder[]): string {
  return rowsToCsv(
    [
      "id",
      "time",
      "symbol",
      "exchange",
      "side",
      "type",
      "qty",
      "price",
      "status",
      "accountId",
      "mode",
      "strategyName",
      "reason",
    ],
    orders.map((o) => [
      o.id,
      o.time,
      o.symbol,
      o.exchange,
      o.side,
      o.type,
      o.quantity,
      o.price,
      o.status,
      o.accountId ?? "",
      o.mode ?? "LIVE",
      o.strategyName ?? "",
      o.reason ?? "",
    ])
  );
}

export function downloadLiveOrdersCsv(orders: LiveExportOrder[]): void {
  downloadCsv(
    `algotrader-live-orders-${exportDateStamp()}.csv`,
    buildLiveOrdersCsv(orders)
  );
}

export function downloadCombinedOrdersCsv(orders: LiveExportOrder[]): void {
  downloadCsv(
    `algotrader-orders-blotter-${exportDateStamp()}.csv`,
    buildLiveOrdersCsv(orders)
  );
}
