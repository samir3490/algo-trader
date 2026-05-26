"use client";

import { useAppStore } from "@/lib/store";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  return (
    <main
      className="flex-1 overflow-y-auto p-6 transition-all duration-300"
      style={{ marginLeft: sidebarOpen ? "16rem" : "72px" }}
    >
      {children}
    </main>
  );
}
