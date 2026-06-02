"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";
import AuthGuard from "@/components/layout/auth-guard";
import Sidebar from "@/components/layout/sidebar";
import MainContent from "@/components/layout/main-content";
import StrategyRunner from "@/components/strategy-runner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <AuthProvider>
      <AuthGuard>
        {isLoginPage ? (
          children
        ) : (
          <>
            <StrategyRunner />
            <Sidebar />
            <MainContent>{children}</MainContent>
          </>
        )}
      </AuthGuard>
    </AuthProvider>
  );
}
