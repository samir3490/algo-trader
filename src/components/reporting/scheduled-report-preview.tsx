"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
type PreviewKind = "digest" | "shortlist";

/**
 * Lightweight preview of scheduled email report shapes — Settings only.
 * Uses sample copy so users see what digests look like without sending mail.
 */
export default function ScheduledReportPreview({
  emailDigestEnabled,
  weeklyShortlistEnabled,
}: {
  emailDigestEnabled: boolean;
  weeklyShortlistEnabled: boolean;
}) {
  const [kind, setKind] = useState<PreviewKind>("digest");
  const [open, setOpen] = useState(false);

  const body = useMemo(() => {
    if (kind === "digest") {
      return {
        title: "Daily / scan digest (preview)",
        lines: [
          "Subject: AlgoTrader — strategy scan summary",
          "Header: events from the latest auto-scan",
          "Body: BUY/SELL lines with symbol, signals, sizing notes",
          "Footer: IST timestamp · Settings → Notifications",
          emailDigestEnabled
            ? "Status: email digest is ON"
            : "Status: email digest is OFF (preview only)",
        ],
      };
    }
    return {
      title: "Weekly shortlist (preview)",
      lines: [
        "Subject: Weekly paper shortlist",
        "Sections: Shortlisted · Why bought · Skipped reasons",
        "Cards: symbol + reason with green/amber accents",
        "Footer: AlgoTrader paper portfolio",
        weeklyShortlistEnabled
          ? "Status: weekly shortlist email is ON"
          : "Status: weekly shortlist email is OFF (preview only)",
      ],
    };
  }, [kind, emailDigestEnabled, weeklyShortlistEnabled]);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-text-primary">Scheduled report preview</p>
          <p className="text-[11px] text-text-tertiary">
            See digest / shortlist layout without sending mail
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-hover"
        >
          {open ? "Hide" : "Preview"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1">
            {(["digest", "shortlist"] as PreviewKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-semibold capitalize min-h-8",
                  kind === k
                    ? "bg-accent text-brand"
                    : "bg-bg-secondary text-text-secondary"
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="rounded-md border border-border bg-bg-secondary p-2.5">
            <p className="text-xs font-semibold text-text-primary mb-1.5">{body.title}</p>
            <ul className="space-y-1">
              {body.lines.map((line) => (
                <li key={line} className="text-[11px] text-text-secondary leading-snug">
                  · {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
