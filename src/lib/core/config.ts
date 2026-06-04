/** Central trading / safety configuration (SmartAlgo-aligned). */

const IST = "Asia/Kolkata";

export function isLiveTradingEnabled(): boolean {
  const v = process.env.ENABLE_LIVE_TRADING?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Reject new strategy entries after this IST time (HH:mm). */
export const STRATEGY_ENTRY_CUTOFF_IST = "15:00";

/** Force MIS square-off reference time (matches settings default). */
export const MIS_SQUARE_OFF_IST = "15:15";

export function isPastStrategyEntryCutoff(now = new Date()): boolean {
  const [hh, mm] = STRATEGY_ENTRY_CUTOFF_IST.split(":").map(Number);
  const ist = new Date(now.toLocaleString("en-US", { timeZone: IST }));
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= hh * 60 + mm;
}

export function isPrismaEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
