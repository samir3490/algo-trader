"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import AuthGuard from "@/components/layout/auth-guard";
import Sidebar from "@/components/layout/sidebar";
import MainContent from "@/components/layout/main-content";
import MobileBottomNav from "@/components/layout/mobile-bottom-nav";
import StrategyRunner from "@/components/strategy-runner";
import { ToastProvider } from "@/components/ui/toast";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGuard>
          {isLoginPage ? (
            children
          ) : (
            <>
              <StrategyRunner />
              <Sidebar />
              <MainContent>{children}</MainContent>
              <MobileBottomNav />
            </>
          )}
        </AuthGuard>
      </ToastProvider>
    </AuthProvider>
  );
}
