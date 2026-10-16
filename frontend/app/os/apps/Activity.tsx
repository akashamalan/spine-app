"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../lib/motion";
import { API_BASE } from "../../lib/useSpine";
import { apiFetch } from "../../lib/identity";
import type { Finding, VeraProbe } from "../../lib/types";
import type { HistoryItem } from "../../lib/useVeraHistory";
import { displayName, findingTitle, relativeTime, severityDotClass, whyItMatters } from "../../lib/labels";
import { useActions } from "../context/actions";

type Tag = "findings" | "vera" | "changes";
type Filter = "all" | Tag;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "findings", label: "Findings" },
  { id: "vera", label: "Vera" },
  { id: "changes", label: "Changes" },
];

const SCENARIO: Record<string, string> = {
  person_leaves: "Someone left the company",
  time_passes: "Time passed",
  docs_conflict: "Two documents started disagreeing",
  orphan_service: "A new service appeared with no owner",
  reset: "The company was reset",
};

type Entry = {
  key: string;
  at: number;
  tags: Tag[];
  dot: string;
  head: ReactNode;
  body?: ReactNode;
  note?: string;
  open?: () => void;
};

type Resolved = { finding_id: string; kind: string; detail: string; severity: string; resolved_at: number; targets: { id: string; type: string; name: string }[] };
type SimRun = { id: string; scenario: string; at: number; summary: string };

function dayLabel(epoch: number): string {
  const d = new Date(epoch * 1000);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

/** The trust rule made visible: what SPINE noticed, who Vera asked, what each
 * person answered in their own words, and which facts changed because of it. */
export function Activity({
  findings,
  probes,
  history,
  isAdmin,
  refreshKey,
}: {
  findings: Finding[];
  probes: VeraProbe[];
  history: HistoryItem[];
  isAdmin: boolean;
  refreshKey: unknown;
}) {
  const a = useActions();
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [resolved, setResolved] = useState<Resolved[]>([]);
  const [runs, setRuns] = useState<SimRun[]>([]);
  // The clock is not read while rendering: it is set after mount and ticks.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  // Problems that have since been fixed are not on the live stream.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/api/findings?include_resolved=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { findings?: (Resolved & { state: string })[] } | null) => {
        if (!cancelled && d?.findings) setResolved(d.findings.filter((f) => f.state === "resolved" && f.resolved_at));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiFetch(`${API_BASE}/api/simulate/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { runs?: SimRun[] } | null) => {
        if (!cancelled && d?.runs) setRuns(d.runs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, refreshKey]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    for (const f of findings) {
      const target = displayName(f.target_name, "");
      out.push({
        key: `f-${f.finding_id}`,
        at: f.found_at,
        tags: ["findings"],
        dot: severityDotClass(f.severity),
        head: <>SPINE noticed: {findingTitle(f)}</>,
        body: (
          <>
            {target && <span className="text-white/85">{target} · </span>}
            {whyItMatters(f)}
          </>
        ),
        open: () => a?.showFinding(f),
      });
    }

    for (const r of resolved) {
      const t = r.targets.find((x) => x.type !== "Claim") ?? r.targets[0];
      out.push({
        key: `r-${r.finding_id}`,
        at: r.resolved_at,
        tags: ["findings"],
        dot: "bg-fresh",
        head: <>Fixed: {findingTitle({ kind: r.kind, detail: r.detail, target_name: t?.name ?? "" } as Finding)}</>,
        body: t ? displayName(t.name, "") : undefined,
        open: () => t && a?.highlight(t.id),
      });
    }

    const openIds = new Set(probes.map((p) => p.task_id));
    for (const p of probes) {
      out.push({
        key: `p-${p.task_id}`,
        at: p.created_at,
        tags: ["vera"],
        dot: "bg-white/50",
        head: (
          <>
            Vera asked {p.asked_of ?? `about ${displayName(p.target_name, "something")}`}
          </>
        ),
        body: p.question,
        open: () => p.target_id && a?.highlight(p.target_id),
      });
    }

    for (const h of history) {
      const subject = displayName(h.subject, "something");
      if (h.asked_at && !openIds.has(h.task_id)) {
        out.push({
          key: `asked-${h.task_id}`,
          at: h.asked_at,
          tags: ["vera"],
          dot: "bg-white/50",
          head: <>Vera asked about {subject}</>,
          body: h.question,
          open: () => h.subject_id && a?.highlight(h.subject_id),
        });
      }
      if (h.answered_at) {
        const who = h.answered_by || "Someone";
        const corrected = h.verdict === "correct" && h.replaced_by;
        out.push({
          key: `a-${h.task_id}`,
          at: h.answered_at,
          tags: corrected ? ["vera", "changes"] : ["vera"],
          dot: corrected ? "bg-aging" : "bg-fresh",
          head: (
            <>
              {who} answered: <span className="italic">“{h.human_answer}”</span>
            </>
          ),
          body: corrected ? (
            <>
              <span className="line-through decoration-white/35">{h.original_fact}</span> was replaced by{" "}
              <span className="text-white/90">{h.replaced_by}</span>
            </>
          ) : h.verdict === "confirm" ? (
            "Confirmed: the fact still stands."
          ) : (
            "Not sure, so nothing changed."
          ),
          note: corrected ? "Only a person's answer changed this fact." : undefined,
          open: () => h.subject_id && a?.highlight(h.subject_id),
        });
      }
    }

    for (const r of runs) {
      out.push({
        key: `s-${r.id}`,
        at: r.at,
        tags: ["changes"],
        dot: "bg-white/50",
        head: <>Simulation: {SCENARIO[r.scenario] ?? r.scenario}</>,
        body: r.summary,
      });
    }

    return out.sort((x, y) => y.at - x.at).slice(0, 300);
  }, [findings, resolved, probes, history, runs, a]);

  const shown = entries.filter((e) => filter === "all" || e.tags.includes(filter));
  const groups = useMemo(() => {
    const g: { day: string; items: Entry[] }[] = [];
    for (const e of shown) {
      const day = dayLabel(e.at);
      const last = g[g.length - 1];
      if (last && last.day === day) last.items.push(e);
      else g.push({ day, items: [e] });
    }
    return g;
  }, [shown]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4 pt-1">
      <div role="group" aria-label="Filter the feed" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${
              filter === f.id ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/85 hover:bg-white/[0.12]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 && <p className="px-2 py-6 text-[15px] text-white/70">Nothing has happened yet.</p>}
        {groups.map((g) => (
          <section key={g.day} aria-label={g.day} className="mb-3">
            <h3 className="px-2 pb-1.5 pt-1 text-[13px] font-medium text-white/60">{g.day}</h3>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {g.items.map((e) => (
                  <motion.li
                    key={e.key}
                    layout={!reduce}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                  >
                    <button
                      type="button"
                      onClick={e.open}
                      disabled={!e.open}
                      title={e.open ? "Show on the graph" : undefined}
                      className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors enabled:hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default"
                    >
                      <span aria-hidden className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${e.dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium leading-snug">{e.head}</span>
                        {e.body && <span className="mt-0.5 block text-[13px] leading-snug text-white/70">{e.body}</span>}
                        {e.note && <span className="mt-1 block text-[13px] font-medium text-aging">{e.note}</span>}
                      </span>
                      {now > 0 && (
                        <span className="shrink-0 pt-0.5 text-[13px] text-white/50">{relativeTime(e.at, now)}</span>
                      )}
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
