"use client";

import { useEffect, useRef } from "react";
import type { HopEvent } from "../page";

const HOP_ICONS: Record<string, string> = {
  entry_points: "🔍",
  findings: "🚨",
  who_knows: "👤",
  broken_path: "🕳",
  neighbours: "🔗",
  blast_radius: "💥",
  path_between: "🛤",
  decision_chain: "📜",
};

export function StagePanel({
  hops,
  isAsking,
}: {
  hops: HopEvent[];
  isAsking: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [hops]);

  if (hops.length === 0 && !isAsking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3 opacity-30">🦴</div>
          <p className="text-sm text-ink-faint">
            Ask a question to watch SPINE walk the graph
          </p>
          <p className="text-xs text-ink-faint mt-2">
            Each hop reveals how knowledge connects — and where it breaks
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
      <div className="space-y-3">
        {hops.map((hop, i) => (
          <div key={i} className="animate-hop">
            <HopCard hop={hop} index={i} />
          </div>
        ))}

        {isAsking && (
          <div className="flex items-center gap-2 text-accent text-sm animate-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-accent" />
            Walking the graph...
          </div>
        )}
      </div>
    </div>
  );
}

function HopCard({ hop, index }: { hop: HopEvent; index: number }) {
  const icon = HOP_ICONS[hop.tool || ""] || "📌";
  const resultCount = hop.results?.length || 0;

  return (
    <div className="bg-slab border border-rule rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-rule bg-sunk/50">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          Hop {typeof hop.hop === "number" ? hop.hop : index + 1}
        </span>
        <span className="text-xs text-ink-faint">
          {hop.description || hop.action}
        </span>
        {resultCount > 0 && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent font-mono">
            {resultCount} result{resultCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Cypher query (collapsed by default via details) */}
      {hop.cypher && (
        <details className="border-b border-rule">
          <summary className="px-3 py-1.5 text-[10px] text-ink-faint cursor-pointer hover:text-ink-soft">
            Show Cypher
          </summary>
          <pre className="px-3 pb-2 text-[11px] font-mono text-accent overflow-x-auto">
            {hop.cypher}
          </pre>
        </details>
      )}

      {/* Results */}
      {hop.results && hop.results.length > 0 && (
        <div className="px-3 py-2 space-y-1.5">
          {hop.results.slice(0, 5).map((r: any, j: number) => (
            <ResultRow key={j} result={r} />
          ))}
          {hop.results.length > 5 && (
            <p className="text-[10px] text-ink-faint">
              +{hop.results.length - 5} more
            </p>
          )}
        </div>
      )}

      {/* Ownership status (broken_path special) */}
      {hop.ownership_status && (
        <div className="px-3 py-2">
          <OwnershipBadge status={hop.ownership_status} gap={hop.has_gap} explanation={hop.gap_explanation} />
        </div>
      )}
    </div>
  );
}

function ResultRow({ result }: { result: any }) {
  if (typeof result === "string") {
    return <p className="text-xs text-ink-soft">{result}</p>;
  }

  const name =
    result.name || result.title || result.text || result.system || JSON.stringify(result).slice(0, 80);
  const confidence = result.confidence;
  const kind = result.kind || result.type || result.label;

  return (
    <div className="flex items-center gap-2 text-xs">
      {kind && (
        <span className="text-[10px] font-mono text-ink-faint px-1 py-0.5 bg-sunk rounded">
          {kind}
        </span>
      )}
      <span className="text-ink-soft truncate">{name}</span>
      {confidence !== undefined && <ConfidenceBar value={confidence} />}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-good" : pct >= 60 ? "bg-warn" : "bg-signal";

  return (
    <div className="flex items-center gap-1 ml-auto shrink-0">
      <div className="w-12 h-1.5 bg-sunk rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-[10px] font-mono ${
          pct < 60 ? "text-signal" : "text-ink-faint"
        }`}
      >
        {pct}%
      </span>
    </div>
  );
}

function OwnershipBadge({
  status,
  gap,
  explanation,
}: {
  status: string;
  gap: boolean;
  explanation?: string;
}) {
  const isOk = status === "owner_active" && !gap;
  const color = isOk ? "text-good" : "text-signal";
  const bg = isOk ? "bg-good-soft" : "bg-signal-soft";
  const icon = isOk ? "✓" : "🕳";
  const label =
    status === "no_owner_edge"
      ? "No owner found"
      : status === "owner_expired"
        ? "Owner expired"
        : status === "owner_inactive"
          ? "Owner left the company"
          : gap
            ? "Ownership gap detected"
            : "Owner active";

  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md ${bg}`}>
      <span className="text-sm">{icon}</span>
      <div>
        <p className={`text-xs font-semibold ${color}`}>{label}</p>
        {explanation && (
          <p className="text-[11px] text-ink-soft mt-0.5">{explanation}</p>
        )}
      </div>
    </div>
  );
}
