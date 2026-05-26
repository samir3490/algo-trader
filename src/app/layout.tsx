import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Sidebar from "@/components/layout/sidebar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex h-full bg-bg-primary">
        <Sidebar />
        <main className="ml-64 flex-1 overflow-y-auto p-6 transition-all duration-300">
          {children}
        </main>
      </body>
    </html>
  );
}
