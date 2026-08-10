export function exitCategoryLabel(input: {
  reason?: string;
  pnlPercent?: number;
}): "PROFIT EXIT" | "RISK EXIT" {
  if (
    input.reason === "take_profit" ||
    (typeof input.pnlPercent === "number" && input.pnlPercent > 0)
  ) {
    return "PROFIT EXIT";
  }
  return "RISK EXIT";
}

/** Correct legacy text so profitable sales are not presented as risk exits. */
export function normalizeExitReasonLabel(reason?: string): string | undefined {
  const text = reason?.trim();
  if (!text) return undefined;
  if (
    /^RISK EXIT\b/i.test(text) &&
    /take profit|target hit|profit target/i.test(text)
  ) {
    return text.replace(/^RISK EXIT\b/i, "PROFIT EXIT");
  }
  return text;
}
