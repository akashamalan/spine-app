"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Star } from "lucide-react";
import type { Finding } from "../lib/types";
import {
  displayName,
  findingLabel,
  findingTitle,
  relativeTime,
  severityDotClass,
  severityLabel,
  whyItMatters,
  type SeverityGroup,
} from "../lib/labels";

const SPRING = { type: "spring", bounce: 0, duration: 0.4 } as const;
const WATCH_KEY = "spine-watching";
const GROUPS: SeverityGroup[] = ["Urgent", "Soon", "When you can"];

/** The four everyday categories the chips filter by. */
const CATEGORIES = ["bus_factor", "orphan", "decay", "contradiction"] as const;
type Category = (typeof CATEGORIES)[number];
type Filter = Category | "watching" | null;

/** Which chip a finding counts under (a bus-factor with nobody left is an orphan). */
function categoryOf(f: Finding): string {
  return findingTitle(f) === findingLabel("orphan") ? "orphan" : f.kind;
}

function readWatching(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WATCH_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeWatching(ids: string[]) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: the star still works for this visit.
  }
}

export function NoticedPanel({
  findings,
  selected,
  onSelect,
}: {
  findings: Finding[];
  selected: Finding | null;
  onSelect: (finding: Finding | null) => void;
}) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>(null);
  const [watching, setWatching] = useState<string[]>([]);
  // 0 until mounted: the clock must not be read while prerendering.
  const [now, setNow] = useState(0);

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => {
    const t = setTimeout(() => setWatching(readWatching()), 0);
    return () => clearTimeout(t);
  }, []);

  // Keep "2 min ago" honest without animating anything.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const toggleWatch = (id: string) => {
    setWatching((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeWatching(next);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of findings) c[categoryOf(f)] = (c[categoryOf(f)] ?? 0) + 1;
    return c;
  }, [findings]);

  const watchedHere = findings.filter((f) => watching.includes(f.finding_id)).length;

  const visible = findings.filter((f) =>
    filter === null
      ? true
      : filter === "watching"
        ? watching.includes(f.finding_id)
        : categoryOf(f) === filter
  );

  const grouped = GROUPS.map((group) => ({
    group,
    items: visible
      .filter((f) => severityLabel(f.severity) === group)
      .sort((a, b) => b.found_at - a.found_at),
  })).filter((g) => g.items.length > 0);

  const enter = reduce ? { opacity: 0 } : { opacity: 0, x: -16 };

  if (findings.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-start justify-center gap-2 px-6 pb-8">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-fresh" />
        <p className="text-[17px] font-semibold">All clear. SPINE is watching.</p>
        <p className="text-[15px] text-white/75">
          It checks your company&apos;s knowledge on its own. Anything that needs a person will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Category chips: tap to filter, tap again to show everything. */}
      <div role="group" aria-label="Filter problems" className="flex shrink-0 flex-wrap gap-1.5 px-5 pb-3">
        {CATEGORIES.map((cat) => {
          const active = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? null : cat)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-left text-[13px] transition-[transform,background-color] active:scale-[0.97] ${
                active ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/85 hover:bg-white/[0.12]"
              }`}
            >
              {findingLabel(cat)}
              <span className="tabular-nums font-semibold">{counts[cat] ?? 0}</span>
            </button>
          );
        })}
        {watchedHere > 0 && (
          <button
            type="button"
            aria-pressed={filter === "watching"}
            onClick={() => setFilter(filter === "watching" ? null : "watching")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-[transform,background-color] active:scale-[0.97] ${
              filter === "watching" ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/85 hover:bg-white/[0.12]"
            }`}
          >
            <Star aria-hidden size={13} className="fill-current" />
            Watching
            <span className="tabular-nums font-semibold">{watchedHere}</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {grouped.length === 0 && (
          <p className="px-3 py-6 text-[15px] text-white/75">Nothing in this group right now.</p>
        )}
        {grouped.map(({ group, items }) => (
          <section key={group} aria-label={group} className="mb-3">
            <h3 className="px-3 pb-1.5 pt-2 text-[13px] font-medium text-white/70">{group}</h3>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {items.map((f) => {
                  const isSelected = selected?.finding_id === f.finding_id;
                  const watched = watching.includes(f.finding_id);
                  return (
                    <motion.li
                      key={f.finding_id}
                      layout={!reduce}
                      initial={enter}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={SPRING}
                      className={`group relative rounded-2xl transition-colors ${
                        isSelected ? "bg-white/[0.14] ring-1 ring-white/25" : "hover:bg-white/[0.06]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(isSelected ? null : f)}
                        aria-pressed={isSelected}
                        className="flex w-full items-start gap-3 rounded-2xl py-2.5 pl-3 pr-11 text-left focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <span
                          aria-hidden
                          className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${severityDotClass(f.severity)}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium leading-snug">{findingTitle(f)}</span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-white/75">
                            {whyItMatters(f)}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-[13px] text-white/60">
                            {displayName(f.target_name, "") && (
                              <>
                                <span className="truncate text-white/85">{displayName(f.target_name, "")}</span>
                                {now > 0 && <span aria-hidden>·</span>}
                              </>
                            )}
                            {now > 0 && <span className="shrink-0">{relativeTime(f.found_at, now)}</span>}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleWatch(f.finding_id)}
                        aria-pressed={watched}
                        aria-label={watched ? "Stop watching this" : "Watch this"}
                        title={watched ? "Stop watching this" : "Watch this (saved on this computer only)"}
                        className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full transition-[transform,opacity] hover:bg-white/10 active:scale-[0.9] ${
                          watched ? "text-aging" : "text-white/60 hover:text-white"
                        }`}
                      >
                        <Star aria-hidden size={16} className={watched ? "fill-current" : ""} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
