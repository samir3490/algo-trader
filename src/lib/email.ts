import nodemailer from "nodemailer";
import { countScanDigestLines } from "@/lib/export/scan-email-status";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export interface OrderEmailParams {
  mode: "LIVE" | "PAPER";
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  orderType: string;
  product: string;
  orderId?: string;
  status?: string;
  accountId?: string;
  strategyName?: string;
}

export interface ScanDigestLine {
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: string;
  strategyName?: string;
}

export async function sendOrderEmail(params: OrderEmailParams) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !recipientEmail) {
    console.log("Email not configured, skipping notification");
    return;
  }

  const {
    mode,
    symbol,
    exchange,
    side,
    quantity,
    price,
    orderType,
    product,
    orderId,
    status,
    accountId,
  } = params;

  const total = quantity * price;
  const modeLabel = mode === "LIVE" ? "🔴 LIVE" : "📝 Paper";
  const sideColor = side === "BUY" ? "#22c55e" : "#ef4444";
  const sideEmoji = side === "BUY" ? "🟢" : "🔴";
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const subject = `${sideEmoji} ${mode} ${side} Order: ${symbol} x${quantity} @ ₹${price.toFixed(2)}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; background: #ffffff; color: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: ${sideColor}; padding: 16px 24px;">
        <h2 style="margin: 0; color: white; font-size: 18px;">${modeLabel} — ${side} Order Placed</h2>
      </div>
      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Symbol</td>
            <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right; font-weight: 600;">${exchange}:${symbol}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Side</td>
            <td style="padding: 8px 0; color: ${sideColor}; font-size: 14px; text-align: right; font-weight: 600;">${side}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Quantity</td>
            <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${quantity}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Price</td>
            <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">₹${price.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Total Value</td>
            <td style="padding: 8px 0; color: #1a1a1a; font-size: 16px; text-align: right; font-weight: 700;">₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Order Type</td>
            <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${orderType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #595959; font-size: 14px;">Product</td>
            <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${product}</td>
          </tr>
          ${orderId ? `<tr><td style="padding: 8px 0; color: #595959; font-size: 14px;">Order ID</td><td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${orderId}</td></tr>` : ""}
          ${status ? `<tr><td style="padding: 8px 0; color: #595959; font-size: 14px;">Status</td><td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${status}</td></tr>` : ""}
          ${accountId ? `<tr><td style="padding: 8px 0; color: #595959; font-size: 14px;">Account</td><td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${accountId}</td></tr>` : ""}
        </table>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #595959; font-size: 12px;">
          ${now} IST • AlgoTrader
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AlgoTrader" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send order email:", error);
  }
}

/** Single email summarizing one strategy scan (avoids dozens of separate emails). */
export async function sendScanDigestEmail(
  lines: ScanDigestLine[],
  options?: { sizingSummary?: string }
) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;
  if (
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_APP_PASSWORD ||
    !recipientEmail ||
    lines.length === 0
  ) {
    return;
  }

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const { executed, risk, skipped } = countScanDigestLines(lines);

  const rows = lines
    .map((l) => {
      const sideColor = l.side === "BUY" ? "#22c55e" : "#ef4444";
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${l.exchange}:${l.symbol}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:${sideColor};font-weight:600;">${l.side}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${l.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">₹${l.price.toFixed(2)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${l.status}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#595959;">${l.strategyName ?? ""}</td>
      </tr>`;
    })
    .join("");

  const subject = `📊 Strategy scan: ${executed} trade${executed !== 1 ? "s" : ""}${risk ? `, ${risk} risk exit` : ""}${skipped ? `, ${skipped} skipped` : ""}`;

  const sizingBanner = options?.sizingSummary
    ? `<p style="margin:0 0 12px;padding:10px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0c4a6e;"><strong>Position sizing:</strong> ${options.sizingSummary}</p>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;color:#1a1a1a;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#3b82f6;padding:16px 24px;">
        <h2 style="margin:0;color:white;font-size:18px;">Strategy scan summary</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#dbeafe;">${now} IST · ${lines.length} event(s)</p>
      </div>
      <div style="padding:16px;overflow-x:auto;">
        ${sizingBanner}
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="color:#595959;text-align:left;">
            <th style="padding:6px 8px;">Symbol</th><th>Side</th><th style="text-align:right;">Qty</th>
            <th style="text-align:right;">Price</th><th>Status</th><th>Strategy</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AlgoTrader" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send digest email:", error);
  }
}

export type HealthAlertKind =
  | "cron_failed"
  | "cron_stale"
  | "scan_zero_trades"
  | "price_corrections";

export async function sendHealthAlertEmail(params: {
  kind: HealthAlertKind;
  title: string;
  message: string;
  details?: Record<string, string | number>;
}) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !recipientEmail) {
    return;
  }

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const emoji =
    params.kind === "cron_failed"
      ? "🚨"
      : params.kind === "cron_stale"
        ? "⏰"
        : params.kind === "price_corrections"
          ? "📉"
          : "⚠️";

  const detailRows = Object.entries(params.details ?? {})
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px;color:#595959;font-size:13px;">${k}</td><td style="padding:6px 8px;text-align:right;font-size:13px;">${v}</td></tr>`
    )
    .join("");

  const subject = `${emoji} AlgoTrader health: ${params.title}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#dc2626;padding:16px 24px;">
        <h2 style="margin:0;color:#fff;font-size:17px;">${params.title}</h2>
      </div>
      <div style="padding:20px 24px;color:#1a1a1a;">
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${params.message}</p>
        ${
          detailRows
            ? `<table style="width:100%;border-collapse:collapse;">${detailRows}</table>`
            : ""
        }
        <p style="margin:16px 0 0;font-size:12px;color:#595959;">${now} IST · Check Dashboard → Paper trading health</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AlgoTrader" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send health alert email:", error);
  }
}

export interface DailyPnlEmailReport {
  dateIST: string;
  startingBalance: number;
  portfolioValue: number;
  cashBalance: number;
  invested: number;
  todayRealizedPnl: number;
  todayTradeCount: number;
  unrealizedPnl: number;
  allTimePnl: number;
  allTimePnlPercent: number;
  openPositions: number;
  sellsToday: number;
  buysToday: number;
}

export async function sendDailyPnlEmail(report: DailyPnlEmailReport) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !recipientEmail) {
    return;
  }

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const todayColor = report.todayRealizedPnl >= 0 ? "#22c55e" : "#ef4444";
  const allTimeColor = report.allTimePnl >= 0 ? "#22c55e" : "#ef4444";
  const todaySign = report.todayRealizedPnl >= 0 ? "+" : "";
  const allTimeSign = report.allTimePnl >= 0 ? "+" : "";

  const subject = `📊 Daily P&L ${report.dateIST}: ${todaySign}₹${report.todayRealizedPnl.toLocaleString("en-IN")} today`;

  const row = (label: string, value: string, color = "#1a1a1a") =>
    `<tr><td style="padding:8px 0;color:#595959;font-size:14px;">${label}</td><td style="padding:8px 0;color:${color};font-size:14px;text-align:right;font-weight:600;">${value}</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#1e3a5f;padding:16px 24px;">
        <h2 style="margin:0;color:#fff;font-size:18px;">Paper trading — daily summary</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#bfdbfe;">${report.dateIST} · ${now} IST</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;">
          ${row("Today's realized P&L", `${todaySign}₹${report.todayRealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, todayColor)}
          ${row("All-time P&L", `${allTimeSign}₹${report.allTimePnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (${report.allTimePnlPercent.toFixed(2)}%)`, allTimeColor)}
          ${row("Portfolio value", `₹${report.portfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`)}
          ${row("Cash balance", `₹${report.cashBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`)}
          ${row("Invested (cost)", `₹${report.invested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`)}
          ${row("Unrealized P&L", `₹${report.unrealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`)}
          ${row("Trades today", `${report.todayTradeCount} (${report.buysToday} buy, ${report.sellsToday} sell)`)}
          ${row("Open positions", String(report.openPositions))}
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#595959;">AlgoTrader paper portfolio · Enable in Settings → Notifications → Daily P&L email</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AlgoTrader" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send daily P&L email:", error);
  }
}

export async function sendWeeklyShortlistEmail(report: {
  weekLabel: string;
  fromDateIST: string;
  toDateIST: string;
  scanCount: number;
  buySignals: number;
  tradesExecuted: number;
  shortlisted: {
    symbol: string;
    signalCount: number;
    boughtReason?: string;
    skipReason?: string;
  }[];
  bought: { symbol: string; reason: string; days: number }[];
  notBought: { symbol: string; signalCount: number; reason: string; days: number }[];
  topSkipReasons: { reason: string; count: number }[];
}) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !recipientEmail) {
    return;
  }

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `📊 Weekly shortlist: ${report.shortlisted.length} candidates, ${report.bought.length} bought`;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const shortlistRows = report.shortlisted
    .slice(0, 25)
    .map((s) => {
      const outcome = s.boughtReason
        ? `<span style="color:#16a34a;font-weight:600;">Bought</span> — ${escape(s.boughtReason)}`
        : `<span style="color:#b45309;font-weight:600;">Not bought</span> — ${escape(s.skipReason ?? "No fill")}`;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escape(s.symbol)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${s.signalCount}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${outcome}</td>
      </tr>`;
    })
    .join("");

  const boughtRows = report.bought
    .slice(0, 20)
    .map(
      (b) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escape(b.symbol)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${escape(b.reason)}</td>
      </tr>`
    )
    .join("");

  const notBoughtRows = report.notBought
    .slice(0, 20)
    .map(
      (n) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escape(n.symbol)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${n.signalCount}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${escape(n.reason)}</td>
      </tr>`
    )
    .join("");

  const skipRows = report.topSkipReasons
    .map(
      (r) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escape(r.reason)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${r.count}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#1d4ed8;padding:16px 24px;">
        <h2 style="margin:0;color:#fff;font-size:18px;">Weekly paper shortlist</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#dbeafe;">${escape(report.weekLabel)} · ${escape(now)} IST</p>
      </div>
      <div style="padding:20px;">
        <p style="margin:0 0 12px;font-size:14px;color:#374151;">
          <strong>${report.scanCount}</strong> scans ·
          <strong>${report.buySignals}</strong> BUY signals ·
          <strong>${report.tradesExecuted}</strong> trades executed ·
          <strong>${report.shortlisted.length}</strong> unique shortlisted symbols
        </p>

        <h3 style="margin:16px 0 8px;font-size:15px;color:#111827;">Shortlisted symbols</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="color:#6b7280;text-align:left;">
            <th style="padding:6px 8px;">Symbol</th>
            <th style="padding:6px 8px;text-align:right;">Signals</th>
            <th style="padding:6px 8px;">Outcome</th>
          </tr></thead>
          <tbody>${shortlistRows || `<tr><td colspan="3" style="padding:8px;color:#6b7280;">No shortlisted BUY candidates this week.</td></tr>`}</tbody>
        </table>

        <h3 style="margin:20px 0 8px;font-size:15px;color:#111827;">Why bought</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="color:#6b7280;text-align:left;">
            <th style="padding:6px 8px;">Symbol</th><th style="padding:6px 8px;">Reason</th>
          </tr></thead>
          <tbody>${boughtRows || `<tr><td colspan="2" style="padding:8px;color:#6b7280;">No paper buys this week.</td></tr>`}</tbody>
        </table>

        <h3 style="margin:20px 0 8px;font-size:15px;color:#111827;">Why not bought</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="color:#6b7280;text-align:left;">
            <th style="padding:6px 8px;">Symbol</th>
            <th style="padding:6px 8px;text-align:right;">Signals</th>
            <th style="padding:6px 8px;">Reason</th>
          </tr></thead>
          <tbody>${notBoughtRows || `<tr><td colspan="3" style="padding:8px;color:#6b7280;">Every shortlisted symbol was filled (or none were shortlisted).</td></tr>`}</tbody>
        </table>

        <h3 style="margin:20px 0 8px;font-size:15px;color:#111827;">Top skip reasons</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="color:#6b7280;text-align:left;">
            <th style="padding:6px 8px;">Reason</th>
            <th style="padding:6px 8px;text-align:right;">Count</th>
          </tr></thead>
          <tbody>${skipRows || `<tr><td colspan="2" style="padding:8px;color:#6b7280;">No skip reasons recorded.</td></tr>`}</tbody>
        </table>

        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
          AlgoTrader · Settings → Notifications → Weekly shortlist email
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AlgoTrader" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send weekly shortlist email:", error);
  }
}
