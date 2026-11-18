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
        compact ? "py-8" : "py-12 sm:py-16",
        className
      )}
    >
      <div className="rounded-2xl bg-bg-tertiary p-3 sm:p-4 mb-3">
        <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-text-tertiary" />
      </div>
      <p className="text-sm sm:text-base font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-text-secondary leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4 w-full sm:w-auto flex justify-center">{action}</div>}
    </div>
  );
}
