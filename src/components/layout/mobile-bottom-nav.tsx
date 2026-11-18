"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Radio,
  ClipboardList,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, mode: "neutral" as const },
  { href: "/paper-trading", label: "Paper", icon: FlaskConical, mode: "paper" as const },
  { href: "/live-trading", label: "Live", icon: Radio, mode: "live" as const },
  { href: "/orders", label: "Orders", icon: ClipboardList, mode: "neutral" as const },
  { href: "/settings", label: "Settings", icon: Settings, mode: "neutral" as const },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-secondary/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Main navigation"
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const activeTone =
            item.mode === "paper"
              ? "text-mode-paper"
              : item.mode === "live"
                ? "text-mode-live"
                : "text-accent";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors touch-manipulation",
                isActive
                  ? activeTone
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && activeTone)} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
