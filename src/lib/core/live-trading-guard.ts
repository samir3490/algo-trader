import { isLiveTradingEnabled } from "@/lib/core/config";

export class LiveTradingDisabledError extends Error {
  constructor() {
    super(
      "Live order routing is disabled. Set ENABLE_LIVE_TRADING=true on the server only when you intentionally want real Zerodha orders."
    );
    this.name = "LiveTradingDisabledError";
  }
}

/** Failsafe: refuse Kite place-order unless explicitly enabled. */
export function assertLiveTradingEnabled(): void {
  if (!isLiveTradingEnabled()) {
    throw new LiveTradingDisabledError();
  }
}
