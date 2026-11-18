import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Calm page chrome — room to breathe, max readable width on ultra-wide.
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
        "min-h-screen p-4 sm:p-6 lg:p-8",
        className
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] space-y-6 sm:space-y-8">
        {children}
      </div>
    </div>
  );
}

/** Two-column composition with comfortable gaps. */
export function ContentGrid({
  children,
  className,
  cols = "lg:grid-cols-2",
}: {
  children: ReactNode;
  className?: string;
  cols?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:gap-5", cols, className)}>
      {children}
    </div>
  );
}

/** Quiet section label above a group of panels. */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "type-label mb-3 px-0.5",
        className
      )}
    >
      {children}
    </p>
  );
}

/** Keep DenseRow alias for existing imports. */
export function DenseRow(props: {
  children: ReactNode;
  className?: string;
  cols?: string;
}) {
  return <ContentGrid {...props} />;
}
