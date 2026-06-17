"use client";

import { cn } from "@/lib/utils";
import {
  strategyAvatarStyle,
  strategyInitials,
} from "@/lib/strategies/strategy-badge-utils";

export interface StrategyBadgesProps {
  names: string[];
  /** Extra signals whose names were not stored (older trades). */
  unknownCount?: number;
  manual?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Shown when hovering the unknown +N badge. */
  unknownTooltip?: string;
}

function Badge({
  name,
  manual,
  size,
}: {
  name: string;
  manual?: boolean;
  size: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]";
  const style = manual
    ? { backgroundColor: "hsl(220 8% 22%)", color: "hsl(220 10% 70%)" }
    : strategyAvatarStyle(name);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-white/10 cursor-default",
        dim
      )}
      style={style}
      title={name}
      aria-label={name}
    >
      {strategyInitials(name)}
    </span>
  );
}

export default function StrategyBadges({
  names,
  unknownCount = 0,
  manual = false,
  size = "sm",
  className,
  unknownTooltip,
}: StrategyBadgesProps) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0 && unknownCount <= 0) {
    return <span className="text-xs text-text-tertiary">—</span>;
  }

  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]";
  const extraTip =
    unknownTooltip ??
    `${unknownCount} more strateg${unknownCount === 1 ? "y" : "ies"} signaled — names not saved on this trade`;

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-0.5", className)}>
      {unique.map((name) => (
        <Badge key={name} name={name} manual={manual && name === "Manual"} size={size} />
      ))}
      {unknownCount > 0 && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
            "bg-bg-tertiary text-text-secondary ring-1 ring-border cursor-default",
            dim
          )}
          title={extraTip}
          aria-label={extraTip}
        >
          +{unknownCount}
        </span>
      )}
    </div>
  );
}
