"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/ui/empty-state";
import type { LucideIcon } from "lucide-react";

export interface DataTableProps {
  /** Desktop / wide table markup (thead + tbody). */
  children: ReactNode;
  /** Optional mobile card list shown below md. */
  mobile?: ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: LucideIcon;
  className?: string;
  /** Min width before horizontal scroll kicks in. */
  minWidthClass?: string;
  /** Accessible name for the table region. */
  "aria-label"?: string;
}

/**
 * Shared table chrome: scroll wrapper, optional mobile twin, consistent empty state.
 * Cell rendering stays with the page.
 */
export default function DataTable({
  children,
  mobile,
  empty,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  emptyIcon,
  className,
  minWidthClass = "min-w-[640px]",
  "aria-label": ariaLabel,
}: DataTableProps) {
  if (empty) {
    return (
      <EmptyState
        compact
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {mobile ? <div className="md:hidden">{mobile}</div> : null}
      <div
        className={cn(
          "overflow-x-auto -mx-1 sm:mx-0",
          mobile && "hidden md:block"
        )}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        <table className={cn("w-full text-sm", minWidthClass)}>{children}</table>
      </div>
    </div>
  );
}
