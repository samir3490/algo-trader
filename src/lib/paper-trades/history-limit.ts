/**
 * Max paper fills kept in paperTrading.trades (newest first after normalize).
 * Also used when loading Orders for merge so history can grow past the old 500 cap.
 * Kept under Firestore's ~1MB document limit (~2k fills is usually safe).
 */
export const PAPER_TRADE_HISTORY_LIMIT = 2000;

/** Cap a newest-first trade list without dropping the sort order. */
export function capPaperTradeHistory<T>(trades: T[]): T[] {
  if (trades.length <= PAPER_TRADE_HISTORY_LIMIT) return trades;
  return trades.slice(0, PAPER_TRADE_HISTORY_LIMIT);
}
