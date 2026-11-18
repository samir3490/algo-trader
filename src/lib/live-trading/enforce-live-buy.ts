import type { Firestore } from "firebase-admin/firestore";
import { KiteConnect } from "kiteconnect";
import {
  evaluateLiveBuyLimits,
  type LiveCapitalSettings,
} from "@/lib/live-trading/capital-limits";
import { loadUserSettingsAdmin, listStrategyUserIds } from "@/lib/compliance/admin-data";

type KiteInstance = InstanceType<typeof KiteConnect>;

async function loadLiveSettings(db: Firestore): Promise<LiveCapitalSettings> {
  const userIds = await listStrategyUserIds(db);
  const userId = userIds[0];
  if (!userId) return {};
  const settings = await loadUserSettingsAdmin(db, userId);
  return {
    liveOrderNotional: settings.liveOrderNotional,
    liveCapitalLimit: settings.liveCapitalLimit,
    maxOrderValue: settings.maxOrderValue,
  };
}

/** Server-side gate for live BUY orders using Kite book + Firestore settings. */
export async function assertLiveBuyWithinLimits(input: {
  db: Firestore;
  kite: KiteInstance;
  side: "BUY" | "SELL";
  qty: number;
  estimatedPrice: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.side !== "BUY") return { ok: true };

  const settings = await loadLiveSettings(input.db);
  let positions: { qty: number; avgPrice: number }[] = [];
  let holdings: { qty: number; avgPrice: number; invested?: number }[] = [];

  try {
    const posPayload = await input.kite.getPositions();
    const net = (posPayload as { net?: any[] })?.net ?? [];
    positions = net.map((p) => ({
      qty: Number(p.quantity) || 0,
      avgPrice: Number(p.average_price) || 0,
    }));
  } catch {
    /* best-effort */
  }

  try {
    const holds = (await input.kite.getHoldings()) as any[];
    holdings = (holds || []).map((h) => ({
      qty: Number(h.quantity) || 0,
      avgPrice: Number(h.average_price) || 0,
      invested:
        typeof h.average_price === "number" && typeof h.quantity === "number"
          ? Number(h.average_price) * Number(h.quantity)
          : undefined,
    }));
  } catch {
    /* best-effort */
  }

  const result = evaluateLiveBuyLimits({
    side: "BUY",
    qty: input.qty,
    price: input.estimatedPrice,
    settings,
    positions,
    holdings,
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "Live capital limit blocked this buy." };
  }
  return { ok: true };
}
