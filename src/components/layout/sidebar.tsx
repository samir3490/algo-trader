"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isMarketOpen } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  LayoutDashboard,
  FlaskConical,
  BrainCircuit,
  BarChart3,
  Radio,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";
import BrandLogo from "@/components/brand/brand-logo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/paper-trading", label: "Paper Trading", icon: FlaskConical },
  { href: "/strategies", label: "Strategies", icon: BrainCircuit },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/live-trading", label: "Live Trading", icon: Radio },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const mobileMenuOpen = useAppStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen);
  const collapsed = !sidebarOpen;
  const marketOpen = isMarketOpen();
  const { user, logout } = useAuth();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, setMobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Logo */}
      <div className="flex h-auto min-h-16 items-center gap-2 border-b border-border px-3 py-3">
        <BrandLogo
          showProduct={isMobile || !collapsed}
          collapsed={!isMobile && collapsed}
          variant={!isMobile && collapsed ? "compact" : "sidebar"}
          className="flex-1 min-w-0"
        />
        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="ml-auto p-1.5 rounded-lg text-text-tertiary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
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
        {(isMobile || !collapsed) && (
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
                  ? "bg-accent/15 text-accent border-l-2 border-l-accent"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border-l-2 border-l-transparent"
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
              {(isMobile || !collapsed) && <span>{item.label}</span>}
              {isActive && (isMobile || !collapsed) && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      {user && (
        <div className="border-t border-border px-3 py-3">
          <div className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2",
            !isMobile && collapsed ? "justify-center" : ""
          )}>
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-7 w-7 shrink-0 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-7 w-7 shrink-0 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                {user.displayName?.[0] || user.email?.[0] || "U"}
              </div>
            )}
            {(isMobile || !collapsed) && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-primary truncate">
                  {user.displayName || "User"}
                </p>
                <p className="text-[10px] text-text-tertiary truncate">
                  {user.email}
                </p>
              </div>
            )}
            {(isMobile || !collapsed) && (
              <button
                onClick={logout}
                className="text-text-tertiary hover:text-loss transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapse Toggle (desktop only) */}
      {!isMobile && (
        <div className="border-t border-border px-3 py-3">
          <button
            onClick={() => setSidebarOpen(collapsed)}
            className="flex w-full items-center justify-center rounded-lg py-2 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden md:flex h-screen flex-col border-r border-border bg-bg-secondary transition-all duration-300",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-brand/20 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-border bg-bg-secondary transition-transform duration-300 md:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </aside>
    </>
  );
}
