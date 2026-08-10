import type { OrderRecord, PaperTradingState } from "@/lib/firebase";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import type { AppSettings } from "@/lib/firebase";
import { ensurePositions, getOpenPositions, withSyncedHoldings } from "./position-manager";
import { rebuildOpenQtyFromFills } from "./rebuild-open-qty";

/** Drop closed positions and zero-qty rows so slot counts stay accurate. */
export function prunePaperStateForScan(
  state: PaperTradingState,
  orders: OrderRecord[] = []
): PaperTradingState {
  let current = ensurePositions(state);
  current = rebuildOpenQtyFromFills(current, orders);
  const positions = (current.positions ?? []).filter(
    (p) =>
      (p.state === "OPEN" || p.state === "PARTIAL_EXIT") && (p.quantity ?? 0) > 0
  );
  return withSyncedHoldings({ ...current, positions });
}

/** Restore starting balance when flat but balance is missing or zero. */
export function ensurePaperTradingBalance(
  state: PaperTradingState,
  settings: Pick<AppSettings, "paperStartingBalance">
): PaperTradingState {
  const starting = resolvePaperStartingBalance(settings);
  const openCount = getOpenPositions(state).length;
  const balance = state.balance ?? 0;
  if (openCount === 0 && balance < starting) {
    return { ...state, balance: starting };
  }
  if (balance <= 0 && openCount === 0) {
    return { ...state, balance: starting };
  }
  return state;
}
