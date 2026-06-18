"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table-sort";

type Props = {
  sortKey: string;
  activeKey: string | null;
  direction: SortDir;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  title?: string;
};

export default function SortableTh({
  sortKey,
  activeKey,
  direction,
  onSort,
  children,
  className,
  align = "left",
  title,
}: Props) {
  const active = activeKey === sortKey;

  return (
    <th
      className={cn(
        "cursor-pointer select-none transition-colors hover:text-text-primary",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        active && "text-text-secondary",
        className
      )}
      title={title ?? "Click to sort"}
      onClick={(e) => {
        e.stopPropagation();
        onSort(sortKey);
      }}
    >
      <span
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "justify-end w-full",
          align === "center" && "justify-center w-full"
        )}
      >
        {children}
        {active &&
          (direction === "asc" ? (
            <ChevronUp className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
          ))}
      </span>
    </th>
  );
}
