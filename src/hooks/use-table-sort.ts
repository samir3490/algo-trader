"use client";

import { useCallback, useState } from "react";
import {
  sortRowsByKey,
  type SortDir,
  type SortableValue,
} from "@/lib/table-sort";

export function useTableSort(options?: { key?: string; dir?: SortDir }) {
  const [sortKey, setSortKey] = useState<string | null>(options?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(options?.dir ?? "asc");

  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortRows = useCallback(
    <T,>(rows: T[], accessors: Record<string, (row: T) => SortableValue>): T[] =>
      sortRowsByKey(rows, sortKey, sortDir, accessors),
    [sortKey, sortDir]
  );

  return { sortKey, sortDir, toggleSort, sortRows };
}
