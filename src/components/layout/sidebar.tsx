"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isMarketOpen } from "@/lib/utils";
import {
  LayoutDashboard,
  FlaskConical,
  BrainCircuit,
  Radio,
  ClipboardList,
  Settings,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/paper-trading", label: "Paper Trading", icon: FlaskConical },
  { href: "/strategies", label: "Strategies", icon: BrainCircuit },
  { href: "/live-trading", label: "Live Trading", icon: Radio },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const marketOpen = isMarketOpen();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-bg-secondary transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-accent">
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-text-primary">
            AlgoTrader
          </span>
        )}
      </div>

      {/* Market Status */}
      <div
        className={cn(
          "mx-3 mt-4 flex items-center gap-2.5 rounded-lg px-3 py-2.5",
          marketOpen ? "bg-profit-muted/40" : "bg-bg-tertiary"
        )}
      >
        <div
          className={cn(
            "pulse-dot shrink-0",
            marketOpen ? "bg-profit" : "bg-text-tertiary"
          )}
        />
        {!collapsed && (
          <div className="min-w-0">
            <p
              className={cn(
                "text-xs font-semibold",
                marketOpen ? "text-profit" : "text-text-tertiary"
              )}
            >
              {marketOpen ? "Market Open" : "Market Closed"}
            </p>
            <p className="text-[10px] text-text-tertiary">
              NSE &middot; BSE
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive
                    ? "text-accent"
                    : "text-text-tertiary group-hover:text-text-secondary"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-border px-3 py-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg py-2 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
