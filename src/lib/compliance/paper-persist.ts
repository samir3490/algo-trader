import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { OrderRecord, PaperTradingState } from "@/lib/firebase";
import { sanitizePaperTradingPayload } from "@/lib/paper-trading/firestore-sanitize";
import { capPaperTradeHistory } from "@/lib/paper-trades/history-limit";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";

export async function persistPaperStateAdmin(
  db: Firestore,
  userId: string,
  paperState: PaperTradingState,
  orders: OrderRecord[] = []
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const raw = paperState.trades ?? [];
    const trades = capPaperTradeHistory(normalizePaperTrades(raw, orders));
    const payload = sanitizePaperTradingPayload({
      balance: paperState.balance,
      holdings: paperState.holdings,
      positions: paperState.positions,
      trades,
    });
    await db.doc(`users/${userId}/data/paperTrading`).set(
      {
        ...payload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}
