"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-3",
        compact ? "py-5" : "py-8 sm:py-10",
        className
      )}
    >
      <div className={cn("rounded-xl bg-bg-tertiary mb-2", compact ? "p-2" : "p-3")}>
        <Icon
          className={cn(
            "text-text-tertiary",
            compact ? "h-5 w-5" : "h-7 w-7 sm:h-8 sm:w-8"
          )}
        />
      </div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-text-secondary leading-snug">
          {description}
        </p>
      )}
      {action && <div className="mt-3 w-full sm:w-auto flex justify-center">{action}</div>}
    </div>
  );
}
