"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Danger styling for destructive confirms. */
  tone?: "neutral" | "danger" | "live";
  className?: string;
}

/** Mobile-first modal — bottom sheet on small screens, centered dialog on md+. */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = "neutral",
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-brand/40 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          "relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border bg-bg-secondary shadow-2xl",
          "max-h-[90vh] overflow-y-auto",
          tone === "danger" && "border-loss/40",
          tone === "live" && "border-mode-live-border",
          tone === "neutral" && "border-border",
          className
        )}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-bg-secondary px-4 py-3 sm:px-5">
          <div className="min-w-0 pt-1">
            <h2 id="modal-title" className="text-base font-semibold text-text-primary">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs sm:text-sm text-text-secondary leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:bg-bg-hover hover:text-text-primary touch-manipulation"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children && <div className="px-4 py-4 sm:px-5">{children}</div>}
        {footer && (
          <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-border bg-bg-secondary px-4 py-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
