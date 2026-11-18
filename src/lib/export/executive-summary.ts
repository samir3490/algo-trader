import { formatCurrency, formatPercent } from "@/lib/utils";
import type { RiskMetrics } from "@/lib/analytics/risk-metrics";

export interface ExecutiveSummaryInput {
  generatedAt: string;
  paper: {
    startingBalance: number;
    balance: number;
    realizedPnl: number;
    unrealizedPnl: number;
    allTimePnl: number;
    metrics?: RiskMetrics | null;
    openHoldings: number;
    tradeCount: number;
  };
  live?: {
    available: number;
    dayPnl: number;
    openPositions: number;
    connected: boolean;
    autoOn: boolean;
  } | null;
  topStrategies?: { name: string; pnl: number; trips: number }[];
}

export function buildExecutiveSummaryHtml(input: ExecutiveSummaryInput): string {
  const m = input.paper.metrics;
  const strategyRows =
    input.topStrategies
      ?.slice(0, 5)
      .map(
        (s) =>
          `<tr><td>${escape(s.name)}</td><td style="text-align:right">${formatCurrency(s.pnl)}</td><td style="text-align:right">${s.trips}</td></tr>`
      )
      .join("") ||
    `<tr><td colspan="3" style="color:#6b7280">No closed strategy round-trips yet.</td></tr>`;

  const liveBlock = input.live
    ? `<h2>Live book</h2>
       <table>
         <tr><td>Connected</td><td>${input.live.connected ? "Yes" : "No"}</td></tr>
         <tr><td>Auto trading</td><td>${input.live.autoOn ? "ON" : "OFF"}</td></tr>
         <tr><td>Cash available</td><td>${formatCurrency(input.live.available)}</td></tr>
         <tr><td>Day P&amp;L</td><td style="color:${input.live.dayPnl >= 0 ? "#059669" : "#dc2626"}">${formatCurrency(input.live.dayPnl)}</td></tr>
         <tr><td>Open positions</td><td>${input.live.openPositions}</td></tr>
       </table>`
    : `<h2>Live book</h2><p style="color:#6b7280">No live snapshot available.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>AlgoTrader executive summary</title>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1a1a1a;line-height:1.45}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:22px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .meta{color:#6b7280;font-size:12px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:left}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px}
  .kpi .l{font-size:10px;color:#6b7280;text-transform:uppercase}
  .kpi .v{font-size:16px;font-weight:700}
</style>
</head>
<body>
  <h1>AlgoTrader — executive summary</h1>
  <p class="meta">Generated ${escape(input.generatedAt)} IST · Agrasen Technologies</p>

  <h2>Paper portfolio</h2>
  <div class="grid">
    <div class="kpi"><div class="l">Cash</div><div class="v">${formatCurrency(input.paper.balance)}</div></div>
    <div class="kpi"><div class="l">All-time P&amp;L</div><div class="v" style="color:${input.paper.allTimePnl >= 0 ? "#059669" : "#dc2626"}">${formatCurrency(input.paper.allTimePnl)}</div></div>
    <div class="kpi"><div class="l">Realized</div><div class="v">${formatCurrency(input.paper.realizedPnl)}</div></div>
    <div class="kpi"><div class="l">Unrealized</div><div class="v">${formatCurrency(input.paper.unrealizedPnl)}</div></div>
  </div>
  <table style="margin-top:10px">
    <tr><td>Starting balance</td><td>${formatCurrency(input.paper.startingBalance)}</td></tr>
    <tr><td>Open holdings</td><td>${input.paper.openHoldings}</td></tr>
    <tr><td>Trades</td><td>${input.paper.tradeCount}</td></tr>
    ${
      m
        ? `<tr><td>Return</td><td>${formatPercent(m.totalReturnPct)}</td></tr>
           <tr><td>Sharpe</td><td>${m.sharpeRatio.toFixed(2)}</td></tr>
           <tr><td>Max drawdown</td><td>${formatPercent(-m.maxDrawdownPct)}</td></tr>
           <tr><td>Win rate</td><td>${m.winRate.toFixed(1)}%</td></tr>`
        : ""
    }
  </table>

  ${liveBlock}

  <h2>Top strategies (paper)</h2>
  <table>
    <thead><tr><th>Strategy</th><th style="text-align:right">P&amp;L</th><th style="text-align:right">Trips</th></tr></thead>
    <tbody>${strategyRows}</tbody>
  </table>

  <p class="meta" style="margin-top:28px">Confidential · for internal review only</p>
</body>
</html>`;
}

export function downloadExecutiveSummaryHtml(input: ExecutiveSummaryInput): void {
  const html = buildExecutiveSummaryHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `algotrader-executive-summary-${new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
