import nodemailer from "nodemailer";

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
export async function sendScanDigestEmail(lines: ScanDigestLine[]) {
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
  const executed = lines.filter((l) => l.status === "EXECUTED").length;
  const risk = lines.filter((l) => l.status.startsWith("RISK")).length;
  const skipped = lines.filter((l) => l.status.startsWith("SKIPPED")).length;

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

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;color:#1a1a1a;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#3b82f6;padding:16px 24px;">
        <h2 style="margin:0;color:white;font-size:18px;">Strategy scan summary</h2>
        <p style="margin:8px 0 0;font-size:13px;color:#dbeafe;">${now} IST · ${lines.length} event(s)</p>
      </div>
      <div style="padding:16px;overflow-x:auto;">
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
