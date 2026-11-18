import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared page chrome — tight padding so more content fits above the fold.
 */
export default function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-screen p-2.5 sm:p-3 md:p-5 space-y-2 sm:space-y-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Dense two-column row that collapses on small screens. */
export function DenseRow({
  children,
  className,
  cols = "lg:grid-cols-2",
}: {
  children: ReactNode;
  className?: string;
  cols?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:gap-2.5", cols, className)}>
      {children}
    </div>
  );
}
