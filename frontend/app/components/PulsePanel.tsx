"use client";

import type { Finding } from "../page";

const KIND_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  bus_factor: { bg: "bg-signal-soft", text: "text-signal", icon: "⚠" },
  orphan: { bg: "bg-warn-soft", text: "text-warn", icon: "👻" },
  decay: { bg: "bg-warn-soft", text: "text-warn", icon: "⏳" },
  contradiction: { bg: "bg-signal-soft", text: "text-signal", icon: "⚡" },
  missing_owner: { bg: "bg-signal-soft", text: "text-signal", icon: "🕳" },
};

function timeAgo(epoch: number): string {
  const diff = Math.floor(Date.now() / 1000 - epoch);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PulsePanel({
  findings,
  onSelect,
  selected,
}: {
  findings: Finding[];
  onSelect: (f: Finding) => void;
  selected: Finding | null;
}) {
  if (findings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-2xl mb-2 animate-pulse-signal">📡</div>
          <p className="text-xs text-ink-faint">
            Listening for findings...
          </p>
          <p className="text-xs text-ink-faint mt-1">
            Run reflexes to scan the graph
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {findings.map((f) => {
        const colors = KIND_COLORS[f.kind] || KIND_COLORS.decay;
        const isSelected = selected?.finding_id === f.finding_id;

        return (
          <button
            key={f.finding_id}
            onClick={() => onSelect(f)}
            className={`w-full text-left px-3 py-2.5 border-b border-rule transition-colors hover:bg-sunk ${
              isSelected ? "bg-sunk border-l-2 border-l-accent" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm shrink-0 mt-0.5">{colors.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
                  >
                    {kindLabel(f.kind)}
                  </span>
                  {f.state === "confirmed" && (
                    <span className="text-[10px] text-good font-medium">
                      confirmed
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-soft leading-snug line-clamp-2">
                  {f.detail}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {f.target_name && (
                    <span className="text-[10px] text-ink-faint font-mono">
                      {f.target_name}
                    </span>
                  )}
                  <span className="text-[10px] text-ink-faint">
                    {timeAgo(f.found_at)}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
