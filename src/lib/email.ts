import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

interface OrderEmailParams {
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
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; background: #0d1117; color: #e6edf3; border-radius: 12px; overflow: hidden;">
      <div style="background: ${sideColor}; padding: 16px 24px;">
        <h2 style="margin: 0; color: white; font-size: 18px;">${modeLabel} — ${side} Order Placed</h2>
      </div>
      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Symbol</td>
            <td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right; font-weight: 600;">${exchange}:${symbol}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Side</td>
            <td style="padding: 8px 0; color: ${sideColor}; font-size: 14px; text-align: right; font-weight: 600;">${side}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Quantity</td>
            <td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${quantity}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Price</td>
            <td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">₹${price.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Total Value</td>
            <td style="padding: 8px 0; color: #e6edf3; font-size: 16px; text-align: right; font-weight: 700;">₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Order Type</td>
            <td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${orderType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Product</td>
            <td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${product}</td>
          </tr>
          ${orderId ? `<tr><td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Order ID</td><td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${orderId}</td></tr>` : ""}
          ${status ? `<tr><td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Status</td><td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${status}</td></tr>` : ""}
          ${accountId ? `<tr><td style="padding: 8px 0; color: #8b949e; font-size: 14px;">Account</td><td style="padding: 8px 0; color: #e6edf3; font-size: 14px; text-align: right;">${accountId}</td></tr>` : ""}
        </table>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #30363d; color: #8b949e; font-size: 12px;">
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
