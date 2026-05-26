import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AppShell from "@/components/layout/app-shell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "AlgoTrader - Indian Market Algo Trading Platform",
  description:
    "Automated algorithmic trading platform for NSE and BSE with paper trading, strategy backtesting, and live execution via Zerodha Kite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen bg-bg-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
