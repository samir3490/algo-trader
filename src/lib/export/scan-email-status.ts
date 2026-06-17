/** Digest line was a successful paper BUY (status may include strength suffix). */
export function isExecutedScanStatus(status: string): boolean {
  return status.trim().startsWith("EXECUTED");
}

export function isRiskScanStatus(status: string): boolean {
  return status.trim().startsWith("RISK");
}

export function isSkippedScanStatus(status: string): boolean {
  return status.trim().startsWith("SKIPPED");
}

export function countScanDigestLines(lines: { status: string }[]): {
  executed: number;
  risk: number;
  skipped: number;
} {
  let executed = 0;
  let risk = 0;
  let skipped = 0;
  for (const line of lines) {
    if (isExecutedScanStatus(line.status)) executed += 1;
    else if (isRiskScanStatus(line.status)) risk += 1;
    else if (isSkippedScanStatus(line.status)) skipped += 1;
  }
  return { executed, risk, skipped };
}
