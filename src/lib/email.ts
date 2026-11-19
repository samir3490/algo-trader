import nodemailer from "nodemailer";
import { countScanDigestLines } from "@/lib/export/scan-email-status";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stacked key/value block — readable on mobile without horizontal scroll. */
function detailBlock(rows: { label: string; value: string; color?: string }[]): string {
  return rows
    .map(
      (r) => `<div style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:4px;">${escapeHtml(r.label)}</div>
      <div style="font-size:14px;color:${r.color ?? "#111827"};font-weight:600;line-height:1.45;word-break:break-word;">${escapeHtml(r.value)}</div>
    </div>`
    )
    .join("");
}

function tradeCard(options: {
  symbol: string;
  exchange: string;
  side: string;
  sideColor: string;
  quantity: number;
  price: number;
  status: string;
  strategyName?: string;
  reason?: string;
}): string {
  const rows: { label: string; value: string; color?: string }[] = [
    {
      label: "Symbol",
      value: `${options.exchange}:${options.symbol}`,
    },
    { label: "Side", value: options.side, color: options.sideColor },
    { label: "Quantity", value: String(options.quantity) },
    { label: "Price", value: `₹${options.price.toFixed(2)}` },
    {
      label: "Value",
      value: `₹${(options.quantity * options.price).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`,
    },
  ];
  if (options.strategyName) {
    rows.push({ label: "Strategy", value: options.strategyName });
  }
  rows.push({
    label: "Reason",
    value: options.reason?.trim() || options.status,
  });
  if (options.reason && options.status && options.reason !== options.status) {
    rows.push({ label: "Status", value: options.status });
  }

  return `<div style="margin:0 0 12px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
    ${detailBlock(rows)}
  </div>`;
}

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
  /** Detailed why (strategy + sector performance). */
  reason?: string;
}

export interface ScanDigestLine {
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: string;
  strategyName?: string;
  reason?: string;
}

export async function sendOrderEmail(params: OrderEmailParams) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !recipientEmail) {
    console.error(
      "Email not configured, skipping notification (need EMAIL_USER, EMAIL_APP_PASSWORD, EMAIL_RECIPIENT)"
    );
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
    strategyName,
    reason,
  } = params;

  const total = quantity * price;
  const modeLabel = mode === "LIVE" ? "LIVE" : "Paper";
  const sideColor = side === "BUY" ? "#16a34a" : "#dc2626";
  const sideEmoji = side === "BUY" ? "🟢" : "🔴";
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const subject = `${sideEmoji} ${mode} ${side}: ${symbol} x${quantity} @ ₹${price.toFixed(2)}`;

  const rows: { label: string; value: string; color?: string }[] = [
    { label: "Symbol", value: `${exchange}:${symbol}` },
    { label: "Side", value: side, color: sideColor },
    { label: "Quantity", value: String(quantity) },
    { label: "Price", value: `₹${price.toFixed(2)}` },
    {
      label: "Total value",
      value: `₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    },
    { label: "Order type", value: orderType },
    { label: "Product", value: product },
  ];
  if (strategyName) rows.push({ label: "Strategy", value: strategyName });
  if (orderId) rows.push({ label: "Order ID", value: orderId });
  if (accountId) rows.push({ label: "Account", value: accountId });
  if (reason || status) {
    rows.push({
      label: "Reason",
      value: (reason || status)!,
    });
  }

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;width:100%;margin:0 auto;background:#ffffff;color:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-sizing:border-box;">
      <div style="background:${sideColor};padding:14px 16px;">
        <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">${modeLabel} — ${side} order</h2>
      </div>
      <div style="padding:12px 16px;box-sizing:border-box;">
        ${detailBlock(rows)}
        <div style="margin-top:14px;color:#6b7280;font-size:12px;line-height:1.4;">
          ${escapeHtml(now)} IST · AlgoTrader
        </div>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"AlgoTrader" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
    console.log(
      `Order email sent to ${recipientEmail} · ${mode} ${side} ${symbol} · messageId=${info.messageId || "?"}`
    );
  } catch (error) {
    console.error("Failed to send order email:", error);
    throw error;
  }
}

/** Single email summarizing one strategy scan (avoids dozens of separate emails). */
export async function sendScanDigestEmail(
  lines: ScanDigestLine[],
  options?: { sizingSummary?: string; sectorSummary?: string }
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
  const { executed, risk, profit, skipped } = countScanDigestLines(lines);

  const cards = lines
    .map((l) =>
      tradeCard({
        symbol: l.symbol,
        exchange: l.exchange,
        side: l.side,
        sideColor: l.side === "BUY" ? "#16a34a" : "#dc2626",
        quantity: l.quantity,
        price: l.price,
        status: l.status,
        strategyName: l.strategyName,
        reason: l.reason,
      })
    )
    .join("");

  const subject = `📊 Strategy scan: ${executed} trade${executed !== 1 ? "s" : ""}${profit ? `, ${profit} profit exit` : ""}${risk ? `, ${risk} risk exit` : ""}${skipped ? `, ${skipped} skipped` : ""}`;

  const banners = [
    options?.sectorSummary
      ? `<p style="margin:0 0 10px;padding:10px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;color:#065f46;line-height:1.45;word-break:break-word;"><strong>Sectors:</strong> ${escapeHtml(options.sectorSummary)}</p>`
      : "",
    options?.sizingSummary
      ? `<p style="margin:0 0 12px;padding:10px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0c4a6e;line-height:1.45;word-break:break-word;"><strong>Sizing:</strong> ${escapeHtml(options.sizingSummary)}</p>`
      : "",
  ].join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;width:100%;margin:0 auto;background:#ffffff;color:#1a1a1a;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-sizing:border-box;">
      <div style="background:#2563eb;padding:14px 16px;">
        <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">Strategy scan summary</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#dbeafe;line-height:1.4;">${escapeHtml(now)} IST · ${lines.length} event(s)</p>
      </div>
      <div style="padding:14px 16px;box-sizing:border-box;">
        ${banners}
        ${cards}
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

  const detailRows = Object.entries(params.details ?? {}).map(([k, v]) => ({
    label: k,
    value: String(v),
  }));

  const subject = `${emoji} AlgoTrader health: ${params.title}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;width:100%;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-sizing:border-box;">
      <div style="background:#dc2626;padding:14px 16px;">
        <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">${escapeHtml(params.title)}</h2>
      </div>
      <div style="padding:14px 16px;color:#1a1a1a;box-sizing:border-box;">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.5;word-break:break-word;">${escapeHtml(params.message)}</p>
        ${detailRows.length ? detailBlock(detailRows) : ""}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(now)} IST · Check Dashboard → Paper trading health</p>
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
  const todayColor = report.todayRealizedPnl >= 0 ? "#16a34a" : "#dc2626";
  const allTimeColor = report.allTimePnl >= 0 ? "#16a34a" : "#dc2626";
  const todaySign = report.todayRealizedPnl >= 0 ? "+" : "";
  const allTimeSign = report.allTimePnl >= 0 ? "+" : "";

  const subject = `📊 Daily P&L ${report.dateIST}: ${todaySign}₹${report.todayRealizedPnl.toLocaleString("en-IN")} today`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;width:100%;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-sizing:border-box;">
      <div style="background:#1e3a5f;padding:14px 16px;">
        <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">Paper trading — daily summary</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#bfdbfe;">${escapeHtml(report.dateIST)} · ${escapeHtml(now)} IST</p>
      </div>
      <div style="padding:14px 16px;box-sizing:border-box;">
        ${detailBlock([
          {
            label: "Today's realized P&L",
            value: `${todaySign}₹${report.todayRealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            color: todayColor,
          },
          {
            label: "All-time P&L",
            value: `${allTimeSign}₹${report.allTimePnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (${report.allTimePnlPercent.toFixed(2)}%)`,
            color: allTimeColor,
          },
          {
            label: "Portfolio value",
            value: `₹${report.portfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          },
          {
            label: "Cash remaining",
            value: `₹${report.cashBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          },
          {
            label: "Invested (cost)",
            value: `₹${report.invested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          },
          {
            label: "Unrealized P&L",
            value: `₹${report.unrealizedPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          },
          {
            label: "Trades today",
            value: `${report.todayTradeCount} (${report.buysToday} buy, ${report.sellsToday} sell)`,
          },
          { label: "Open positions", value: String(report.openPositions) },
        ])}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">AlgoTrader paper portfolio · Settings → Notifications → Daily P&L email</p>
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

function stackedItemCard(title: string, body: string, accent?: string): string {
  return `<div style="margin:0 0 10px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;border-left:4px solid ${accent ?? "#2563eb"};">
    <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px;word-break:break-word;">${escapeHtml(title)}</div>
    <div style="font-size:13px;color:#374151;line-height:1.5;word-break:break-word;white-space:pre-wrap;">${escapeHtml(body)}</div>
  </div>`;
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

  const shortlistCards = report.shortlisted
    .slice(0, 25)
    .map((s) => {
      const outcome = s.boughtReason
        ? `Bought — ${s.boughtReason}`
        : `Not bought — ${s.skipReason ?? "No fill"}`;
      return stackedItemCard(
        s.symbol,
        `Signals: ${s.signalCount}\n${outcome}`,
        s.boughtReason ? "#16a34a" : "#d97706"
      );
    })
    .join("");

  const boughtCards = report.bought
    .slice(0, 20)
    .map((b) => stackedItemCard(b.symbol, b.reason, "#16a34a"))
    .join("");

  const notBoughtCards = report.notBought
    .slice(0, 20)
    .map((n) =>
      stackedItemCard(
        n.symbol,
        `Signals: ${n.signalCount}\n${n.reason}`,
        "#d97706"
      )
    )
    .join("");

  const skipCards = report.topSkipReasons
    .map((r) => stackedItemCard(r.reason, `Count: ${r.count}`, "#6b7280"))
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;width:100%;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-sizing:border-box;">
      <div style="background:#1d4ed8;padding:14px 16px;">
        <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">Weekly paper shortlist</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#dbeafe;line-height:1.4;">${escapeHtml(report.weekLabel)} · ${escapeHtml(now)} IST</p>
      </div>
      <div style="padding:14px 16px;box-sizing:border-box;">
        <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.5;">
          <strong>${report.scanCount}</strong> scans ·
          <strong>${report.buySignals}</strong> BUY signals ·
          <strong>${report.tradesExecuted}</strong> trades ·
          <strong>${report.shortlisted.length}</strong> shortlisted
        </p>

        <h3 style="margin:8px 0 10px;font-size:15px;color:#111827;">Shortlisted</h3>
        ${shortlistCards || `<p style="color:#6b7280;font-size:13px;">No shortlisted BUY candidates this week.</p>`}

        <h3 style="margin:18px 0 10px;font-size:15px;color:#111827;">Why bought</h3>
        ${boughtCards || `<p style="color:#6b7280;font-size:13px;">No paper buys this week.</p>`}

        <h3 style="margin:18px 0 10px;font-size:15px;color:#111827;">Why not bought</h3>
        ${notBoughtCards || `<p style="color:#6b7280;font-size:13px;">Every shortlisted symbol was filled (or none were shortlisted).</p>`}

        <h3 style="margin:18px 0 10px;font-size:15px;color:#111827;">Top skip reasons</h3>
        ${skipCards || `<p style="color:#6b7280;font-size:13px;">No skip reasons recorded.</p>`}

        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">
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

export async function sendMonthlyLivePerformanceEmail(report: {
  monthLabel: string;
  fromDateIST: string;
  toDateIST: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  buyTurnover: number;
  sellTurnover: number;
  totalTurnover: number;
  realizedPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  fees: number;
  topSymbols: { symbol: string; trades: number; buyQty: number; sellQty: number }[];
  topStrategies: { strategyName: string; trades: number; buys: number; sells: number }[];
}) {
  const recipientEmail = process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD || !recipientEmail) {
    return;
  }

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const pnlColor = report.realizedPnl >= 0 ? "#16a34a" : "#dc2626";
  const pnlSign = report.realizedPnl >= 0 ? "+" : "";
  const inr = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const subject = `📈 Live trading ${report.monthLabel}: ${pnlSign}${inr(report.realizedPnl)} realized`;

  const symbolCards = report.topSymbols
    .map((s) =>
      stackedItemCard(
        s.symbol,
        `${s.trades} trades · buy qty ${s.buyQty} · sell qty ${s.sellQty}`,
        "#059669"
      )
    )
    .join("");

  const strategyCards = report.topStrategies
    .map((s) =>
      stackedItemCard(
        s.strategyName,
        `${s.trades} trades · ${s.buys} buy · ${s.sells} sell`,
        "#2563eb"
      )
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;width:100%;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-sizing:border-box;">
      <div style="background:#065f46;padding:14px 16px;">
        <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">Live trading — monthly performance</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#a7f3d0;line-height:1.4;">
          ${escapeHtml(report.monthLabel)} · ${escapeHtml(report.fromDateIST)} → ${escapeHtml(report.toDateIST)} · ${escapeHtml(now)} IST
        </p>
      </div>
      <div style="padding:14px 16px;box-sizing:border-box;">
        ${detailBlock([
          {
            label: "Realized P&L (FIFO)",
            value: `${pnlSign}${inr(report.realizedPnl)}`,
            color: pnlColor,
          },
          {
            label: "Win / Loss",
            value: `${report.wins}W / ${report.losses}L${report.winRate > 0 ? ` · ${report.winRate}% win` : ""}`,
          },
          {
            label: "Trades",
            value: `${report.tradeCount} (${report.buyCount} buy · ${report.sellCount} sell)`,
          },
          { label: "Buy turnover", value: inr(report.buyTurnover) },
          { label: "Sell turnover", value: inr(report.sellTurnover) },
          { label: "Total traded", value: inr(report.totalTurnover) },
          { label: "Est. fees", value: inr(report.fees) },
        ])}

        <h3 style="margin:18px 0 10px;font-size:15px;color:#111827;">Top symbols</h3>
        ${symbolCards || `<p style="color:#6b7280;font-size:13px;">No live fills recorded last month.</p>`}

        <h3 style="margin:18px 0 10px;font-size:15px;color:#111827;">Strategies used</h3>
        ${strategyCards || `<p style="color:#6b7280;font-size:13px;">No strategy-tagged live fills last month.</p>`}

        <p style="margin:16px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">
          AlgoTrader · Live order history · Sent on the 1st for the previous month
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
    console.error("Failed to send monthly live performance email:", error);
    throw error;
  }
}
