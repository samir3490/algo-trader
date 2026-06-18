export type SortableValue = string | number | boolean | null | undefined;
export type SortDir = "asc" | "desc";

export function compareSortValues(a: SortableValue, b: SortableValue): number {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }

  return String(a).toLowerCase().localeCompare(String(b).toLowerCase(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortRowsByAccessor<T>(
  rows: T[],
  accessor: (row: T) => SortableValue,
  dir: SortDir
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort(
    (x, y) => mult * compareSortValues(accessor(x), accessor(y))
  );
}

export function sortRowsByKey<T>(
  rows: T[],
  sortKey: string | null,
  dir: SortDir,
  accessors: Record<string, (row: T) => SortableValue>
): T[] {
  if (!sortKey) return rows;
  const accessor = accessors[sortKey];
  if (!accessor) return rows;
  return sortRowsByAccessor(rows, accessor, dir);
}
