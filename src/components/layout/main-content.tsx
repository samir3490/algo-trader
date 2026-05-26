"use client";

import { useAppStore } from "@/lib/store";
import { Menu, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen);

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-30 flex md:hidden items-center gap-3 border-b border-border bg-bg-secondary px-4 py-3">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-accent">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-text-primary">AlgoTrader</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className={cn(
          "flex-1 overflow-y-auto transition-all duration-300",
          "ml-0",
          sidebarOpen ? "md:ml-64" : "md:ml-[72px]"
        )}
      >
        {children}
      </main>
    </div>
  );
}
