/** Stable hue from strategy name for avatar backgrounds. */
export function strategyHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/** 1–2 letter initials for compact badges. */
export function strategyInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  if (cleaned === "Manual") return "M";
  if (cleaned === "Auto strategy") return "A";

  const words = cleaned.split(/[\s/\-–]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const w = words[0] ?? cleaned;
  return w.length >= 2 ? w.slice(0, 2).toUpperCase() : w.toUpperCase();
}

export function strategyAvatarStyle(name: string): { backgroundColor: string; color: string } {
  const hue = strategyHue(name);
  return {
    backgroundColor: `hsl(${hue} 55% 28%)`,
    color: `hsl(${hue} 70% 88%)`,
  };
}
