"use client";

import { useMemo, useState } from "react";
import type { Claim, Finding } from "../../lib/types";
import type { HistoryItem } from "../../lib/useVeraHistory";
import { confidenceBgClass, confidenceLabel, type ConfidenceToken } from "../../lib/labels";
import { categoryOf } from "../../components/NoticedPanel";
import { StatsStrip } from "../../components/StatsStrip";
import { useContextMenu } from "../context/ContextMenuProvider";
import { useMenus } from "../context/menus";
import { ConfidenceMath } from "../context/Popovers";

type Status = "all" | "fresh" | "aging" | "stale" | "replaced";

const FILTERS: { id: Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fresh", label: "Up to date" },
  { id: "aging", label: "Getting old" },
  { id: "stale", label: "Probably outdated" },
  { id: "replaced", label: "Replaced" },
];

const PILL: Record<ConfidenceToken, string> = {
  fresh: "bg-fresh/20 text-fresh",
  aging: "bg-aging/20 text-aging",
  stale: "bg-stale/20 text-stale",
};

function ageWords(days: number | null): string | null {
  if (days === null) return null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (days < 14) return `${plural(Math.round(days), "day")} old`;
  if (days < 60) return `${plural(Math.round(days / 7), "week")} old`;
  if (days < 700) return `${plural(Math.round(days / 30.44), "month")} old`;
  return `${(days / 365).toFixed(1)} years old`;
}

/** The truth ledger: every fact SPINE holds, least trusted first, with how
 * much it is trusted and why. Replaced facts are listed but never as current. */
export function Facts({
  claims,
  findings,
  resolvedThisWeek,
  history,
}: {
  claims: Claim[];
  findings: Finding[];
  resolvedThisWeek: number | null;
  history: HistoryItem[];
}) {
  const menus = useMenus();
  const { openMenu, showPopover } = useContextMenu();
  const [filter, setFilter] = useState<Status>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of findings) c[categoryOf(f)] = (c[categoryOf(f)] ?? 0) + 1;
    return c;
  }, [findings]);

  // Live facts, least trusted first.
  const live = useMemo(() => [...claims].sort((a, b) => a.confidence - b.confidence), [claims]);
  // Facts a person has corrected. /api/claims leaves them out, so they come
  // from the record of answers.
  const replaced = useMemo(
    () => history.filter((h) => h.verdict === "correct" && h.original_fact && h.replaced_by),
    [history]
  );

  const needle = q.trim().toLowerCase();
  const matches = (t: string) => !needle || t.toLowerCase().includes(needle);
  const liveShown = live.filter((c) => matches(c.text) && (filter === "all" || filter === confidenceLabel(c.confidence).token));
  const replacedShown = replaced.filter(
    (h) => (filter === "all" || filter === "replaced") && matches(h.original_fact ?? "")
  );
  const none = liveShown.length === 0 && replacedShown.length === 0;

  const tally = (id: Status) =>
    id === "all"
      ? live.length + replaced.length
      : id === "replaced"
        ? replaced.length
        : live.filter((c) => confidenceLabel(c.confidence).token === id).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StatsStrip
        busFactorCount={counts.bus_factor ?? 0}
        orphanCount={counts.orphan ?? 0}
        claims={claims}
        resolvedThisWeek={resolvedThisWeek}
        activeFilter={null}
        columns={3}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the facts"
          aria-label="Search the facts"
          className="glass-thin w-full rounded-full px-4 py-2 text-[15px] text-white outline-none placeholder:text-white/55 focus-visible:outline-2 focus-visible:outline-white"
        />
        <div role="group" aria-label="Filter facts" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${
                filter === f.id ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/85 hover:bg-white/[0.12]"
              }`}
            >
              {f.label}
              <span className="tabular-nums font-semibold">{tally(f.id)}</span>
            </button>
          ))}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {none && <li className="px-2 py-6 text-[15px] text-white/70">No facts match that.</li>}
          {liveShown.map((c) => {
            const l = confidenceLabel(c.confidence);
            const age = ageWords(c.age_days);
            return (
              <li key={c.id} className="mb-1">
                <button
                  type="button"
                  onClick={(e) =>
                    showPopover({ x: e.clientX, y: e.clientY }, <ConfidenceMath claim={c} />, "Why this much trust")
                  }
                  onContextMenu={(e) => menus && openMenu(e, menus.evidence(c.id, c.text, { x: e.clientX, y: e.clientY }))}
                  className="w-full rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span className="block text-[15px] leading-snug">{c.text}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/65">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                        <span
                          className={`block h-full rounded-full ${confidenceBgClass(l.token)}`}
                          style={{ width: `${l.percent}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-white/85">{l.percent}%</span>
                    </span>
                    {age && <span>{age}</span>}
                    {typeof c.source_count === "number" && (
                      <span>
                        {c.source_count} {c.source_count === 1 ? "source" : "sources"}
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 ${PILL[l.token]}`}>{l.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {replacedShown.map((h) => (
            <li key={h.task_id} className="mb-1 rounded-2xl px-3 py-2.5 text-white/60">
              <span className="block text-[15px] leading-snug line-through decoration-white/35">{h.original_fact}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-white/75">Replaced</span>
                <span className="min-w-0 text-white/65">Now: {h.replaced_by}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
