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
        "flex flex-col items-center justify-center text-center px-4",
        compact ? "py-8" : "py-12 sm:py-14",
        className
      )}
    >
      <div
        className={cn(
          "rounded-2xl bg-bg-tertiary mb-3",
          compact ? "p-2.5" : "p-3.5"
        )}
      >
        <Icon
          className={cn(
            "text-text-tertiary",
            compact ? "h-5 w-5" : "h-7 w-7"
          )}
        />
      </div>
      <p className="text-sm font-semibold text-text-primary tracking-tight">
        {title}
      </p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-text-secondary leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4 w-full sm:w-auto flex justify-center">{action}</div>
      )}
    </div>
  );
}
