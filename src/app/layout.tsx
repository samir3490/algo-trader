import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import AppShell from "@/components/layout/app-shell";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "AlgoTrader | Agrasen Technologies",
  description:
    "AlgoTrader by Agrasen Technologies — automated trading for NSE and BSE with paper trading, strategy backtesting, and Zerodha execution.",
  icons: {
    icon: "/brand/agrasen-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen bg-bg-primary font-sans text-text-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
