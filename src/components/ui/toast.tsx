"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

/** Safe hook when toast provider may be missing (falls back to no-op). */
export function useOptionalToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return (
    ctx ?? {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    }
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed z-[100] left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm flex flex-col gap-2 pointer-events-none"
        style={{
          bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const Icon =
    item.tone === "success"
      ? CheckCircle2
      : item.tone === "error"
        ? AlertTriangle
        : Info;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-3 shadow-xl bg-bg-elevated",
        item.tone === "success" && "border-profit/30",
        item.tone === "error" && "border-loss/40 bg-loss-muted",
        item.tone === "info" && "border-border"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 mt-0.5",
          item.tone === "success" && "text-profit",
          item.tone === "error" && "text-loss",
          item.tone === "info" && "text-info"
        )}
      />
      <p className="flex-1 text-sm text-text-primary leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-md text-text-tertiary hover:text-text-primary touch-manipulation"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
