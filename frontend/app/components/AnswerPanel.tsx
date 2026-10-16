"use client";

import type { Evidence, Finding, HopEvent } from "../page";

function confidenceColor(pct: number): string {
  if (pct >= 80) return "var(--good)";
  if (pct >= 60) return "var(--warn)";
  return "var(--signal)";
}

function EvidenceRow({ item }: { item: Evidence }) {
  const pct = Math.round((item.confidence ?? 0) * 100);
  const color = confidenceColor(pct);

  return (
    <div className="space-y-1">
      <p className="text-xs text-ink-soft leading-snug">
        {item.stale && <span className="mr-1">⚠</span>}
        {item.text}
      </p>
      <div className="flex items-center gap-1.5">
        {item.fact_type && (
          <span className="text-[10px] font-mono text-ink-faint px-1 py-0.5 bg-sunk rounded">
            {item.fact_type}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <div className="w-16 h-1.5 bg-sunk rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[10px] font-mono" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function AnswerPanel({
  answer,
  evidence,
  hops,
  selectedFinding,
}: {
  answer: string;
  evidence: Evidence[];
  hops: HopEvent[];
  selectedFinding: Finding | null;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Selected finding detail */}
      {selectedFinding && (
        <div className="px-3 py-3 border-b border-rule">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Finding Detail
            </h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                selectedFinding.state === "confirmed"
                  ? "bg-signal-soft text-signal"
                  : "bg-warn-soft text-warn"
              }`}
            >
              {selectedFinding.state}
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                Kind
              </span>
              <p className="text-sm text-ink-soft">
                {selectedFinding.kind.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                Detail
              </span>
              <p className="text-sm text-ink-soft leading-snug">
                {selectedFinding.detail}
              </p>
            </div>
            {selectedFinding.target_name && (
              <div>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                  Target
                </span>
                <p className="text-sm font-mono text-primary">
                  {selectedFinding.target_name}
                </p>
              </div>
            )}
            <div>
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">
                Severity
              </span>
              <p
                className={`text-sm font-semibold ${
                  selectedFinding.severity === "high"
                    ? "text-signal"
                    : selectedFinding.severity === "medium"
                      ? "text-warn"
                      : "text-ink-soft"
                }`}
              >
                {selectedFinding.severity}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Answer text */}
      {answer && (
        <div className="px-3 py-3 border-b border-rule">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-2">
            Answer
          </h3>
          <p className="text-[15px] text-ink leading-relaxed whitespace-pre-wrap">
            {answer}
          </p>
        </div>
      )}

      {/* Evidence the answer was built from */}
      {evidence.length > 0 && (
        <div className="px-3 py-3 border-b border-rule">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-2">
            Based on these facts
          </h3>
          <div className="space-y-3">
            {evidence.map((item, i) => (
              <EvidenceRow key={item.claim_id || i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Hop summary */}
      {hops.length > 0 && (
        <div className="px-3 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-2">
            Walk Summary
          </h3>
          <div className="space-y-1">
            {hops.map((hop, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-ink-soft"
              >
                <span className="w-4 h-4 rounded-full bg-accent-soft text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="truncate">
                  {hop.description || hop.action}
                </span>
                {hop.results && (
                  <span className="text-[10px] text-ink-faint ml-auto shrink-0">
                    {hop.results.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!answer && !selectedFinding && hops.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6 h-full">
          <div className="text-center">
            <p className="text-xs text-ink-faint">
              Answers and findings appear here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
