import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { OrderRecord, PaperTrade } from "@/lib/firebase";
import {
  newTradeIds,
  paperTradeToOrderRecord,
} from "@/lib/portfolio/paper-order-record";

export async function persistPaperOrderAdmin(
  db: Firestore,
  userId: string,
  record: OrderRecord
): Promise<void> {
  await db.doc(`users/${userId}/orders/${record.id}`).set({
    ...record,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function persistNewPaperTradesAsOrdersAdmin(
  db: Firestore,
  userId: string,
  before: PaperTrade[],
  after: PaperTrade[],
  options?: { product?: string }
): Promise<void> {
  for (const trade of newTradeIds(before, after)) {
    await persistPaperOrderAdmin(
      db,
      userId,
      paperTradeToOrderRecord(trade, {
        product: options?.product,
        mode: "PAPER",
      })
    );
  }
}
