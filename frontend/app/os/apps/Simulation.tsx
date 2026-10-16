"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { API_BASE, type SimRun } from "../../lib/useSpine";
import { apiFetch } from "../../lib/identity";
import type { Finding, VeraProbe } from "../../lib/types";
import { displayName, findingTitle, severityDotClass, whyItMatters } from "../../lib/labels";

type Person = { id: string; name: string; has_left: boolean; owns: { id: string }[] };

type Scenario = { id: string; label: (who: string) => string; hint: string; body?: () => Record<string, unknown> };

/** The honest changes the demo can make. Each runs the real reflexes after. */
const SCENARIOS: Scenario[] = [
  {
    id: "person_leaves",
    label: (who) => `${who} leaves the company`,
    hint: "Their ownership ends and the facts naming them come into doubt.",
  },
  {
    id: "time_passes",
    label: () => "Six months pass",
    hint: "Every fact gets six months older, so some stop being trustworthy.",
  },
  {
    id: "docs_conflict",
    label: () => "Two documents start disagreeing",
    hint: "A new runbook says the opposite of the old ones about rollbacks.",
  },
  {
    id: "orphan_service",
    label: () => "A new service appears, unowned",
    hint: "Something is running that nobody has been asked to look after.",
  },
];

export function Simulation({
  simulate,
  simRunning,
  lastSim,
  findings,
  probes,
}: {
  simulate: (scenario: string, body?: Record<string, unknown>) => Promise<SimRun | null>;
  simRunning: string | null;
  lastSim: SimRun | null;
  findings: Finding[];
  probes: VeraProbe[];
}) {
  const reduce = useReducedMotion();
  const [people, setPeople] = useState<Person[]>([]);
  const [who, setWho] = useState<string>("");
  const [confirmReset, setConfirmReset] = useState(false);

  // Who could leave: anyone still here. Re-read after every run, because a
  // run can change who is still here.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/api/people`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { people?: Person[] } | null) => {
        if (!cancelled && d?.people) setPeople(d.people.filter((p) => !p.has_left));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lastSim]);

  // By default the person who owns the most leaves, so it matters.
  const defaultWho = useMemo(
    () => [...people].sort((a, b) => b.owns.length - a.owns.length || a.name.localeCompare(b.name))[0]?.id ?? "",
    [people]
  );
  const leaver = people.find((p) => p.id === who) ?? people.find((p) => p.id === defaultWho);
  const busy = simRunning !== null;

  const noticed = useMemo(() => {
    if (!lastSim) return [];
    const ids = new Set(lastSim.newIds);
    // Two different checks can reach the same plain-language conclusion about
    // the same thing (no owner left, nothing depends on it); say it once.
    const seen = new Set<string>();
    return findings.filter((f) => {
      if (!ids.has(f.finding_id)) return false;
      const key = `${findingTitle(f)}|${f.target_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [findings, lastSim]);
  const asked = useMemo(() => {
    if (!lastSim) return [];
    const ids = new Set(lastSim.newIds);
    return probes.filter((p) => ids.has(p.finding_id));
  }, [probes, lastSim]);

  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 10 };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-1">
      <p className="text-[13px] text-white/70">
        Make something happen to the company, then watch SPINE notice it. Everyone and everything here is invented.
      </p>

      <ul className="flex flex-col gap-1.5">
        {SCENARIOS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={busy || (s.id === "person_leaves" && !leaver)}
              onClick={() => simulate(s.id, s.id === "person_leaves" && leaver ? { person_id: leaver.id } : undefined)}
              className="glass-thin w-full rounded-2xl px-4 py-3 text-left transition-[background-color,transform] hover:bg-white/[0.14] active:scale-[0.99] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="flex items-center justify-between gap-2 text-[15px] font-medium">
                {s.label(leaver?.name ?? "Someone")}
                {simRunning === s.id && <span className="text-[13px] font-normal text-white/70">Running…</span>}
              </span>
              <span className="mt-0.5 block text-[13px] text-white/65">{s.hint}</span>
            </button>
            {s.id === "person_leaves" && people.length > 1 && (
              <label className="mt-1.5 flex items-center gap-2 px-1 text-[13px] text-white/70">
                Someone else leaves instead:
                <select
                  value={leaver?.id ?? ""}
                  onChange={(e) => setWho(e.target.value)}
                  disabled={busy}
                  className="min-w-0 rounded-lg bg-white/10 px-2 py-1 text-[13px] text-white outline-none focus-visible:outline-2 focus-visible:outline-white"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id} className="bg-neutral-900">
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        {!confirmReset ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmReset(true)}
            className="rounded-full bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-white/85 hover:bg-white/[0.14] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
          >
            Reset the company
          </button>
        ) : (
          <>
            <span className="text-[13px] text-white/80">Everything simulated, and every answer given to Vera, is lost.</span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setConfirmReset(false);
                await simulate("reset");
              }}
              className="rounded-full bg-stale/80 px-4 py-2 text-[13px] font-medium text-white hover:bg-stale focus-visible:outline-2 focus-visible:outline-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-full px-3 py-2 text-[13px] text-white/75 hover:bg-white/10"
            >
              Cancel
            </button>
          </>
        )}
        {simRunning === "reset" && <span className="text-[13px] text-white/70">Rebuilding…</span>}
      </div>

      <section aria-label="What SPINE noticed" className="min-h-[96px]">
        <h3 className="pb-2 text-[13px] font-medium text-white/70">What SPINE noticed</h3>
        {!lastSim && <p className="text-[15px] text-white/60">Run something above and it will show up here.</p>}
        {lastSim && (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1">
              {lastSim.changed.map((c) => (
                <li key={c} className="text-[13px] text-white/75">
                  {c}
                </li>
              ))}
            </ul>
            {noticed.length === 0 && asked.length === 0 && (
              <p className="text-[15px] text-white/75">SPINE didn&apos;t find anything new because of this.</p>
            )}
            <ul className="flex flex-col gap-1.5">
              <AnimatePresence initial={false}>
                {noticed.map((f, i) => (
                  <motion.li
                    key={f.finding_id}
                    initial={enter}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 8) * 0.12 }}
                    className="glass-thin flex items-start gap-3 rounded-2xl px-3.5 py-2.5"
                  >
                    <span aria-hidden className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${severityDotClass(f.severity)}`} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-snug">{findingTitle(f)}</span>
                      <span className="block text-[13px] text-white/70">
                        {displayName(f.target_name, "")} {displayName(f.target_name, "") ? "· " : ""}
                        {whyItMatters(f)}
                      </span>
                    </span>
                  </motion.li>
                ))}
                {asked.map((p, i) => (
                  <motion.li
                    key={p.task_id}
                    initial={enter}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: reduce ? 0 : (noticed.length + i) * 0.12 }}
                    className="glass-thin rounded-2xl px-3.5 py-2.5"
                  >
                    <span className="block text-[13px] text-white/70">
                      Vera is asking {p.asked_of ?? `about ${displayName(p.target_name, "something")}`}
                    </span>
                    <span className="block text-[15px] leading-snug">{p.question}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
