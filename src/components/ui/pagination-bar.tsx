"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 25;

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize = DEFAULT_PAGE_SIZE
): { pageItems: T[]; totalPages: number; safePage: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  };
}

export default function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  const pages: number[] = [];
  const window = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 ||
      p === totalPages ||
      (p >= safePage - window && p <= safePage + window)
    ) {
      pages.push(p);
    }
  }
  const withGaps: Array<number | "…"> = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i]! - pages[i - 1]! > 1) withGaps.push("…");
    withGaps.push(pages[i]!);
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-3",
        className
      )}
    >
      <p className="text-xs text-text-tertiary">
        Showing {from}–{to} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-bg-hover disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {withGaps.map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="px-1 text-xs text-text-tertiary"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold",
                p === safePage
                  ? "bg-accent text-white"
                  : "border border-border text-text-secondary hover:bg-bg-hover"
              )}
              aria-current={p === safePage ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-bg-hover disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
