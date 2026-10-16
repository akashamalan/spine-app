"use client";

import { useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "../../lib/useSpine";
import { apiFetch } from "../../lib/identity";
import type { Claim, Finding } from "../../lib/types";
import { avatarStyle, initials } from "../../lib/people";
import { confidenceBgClass, confidenceLabel, displayName, plainDetail, whyItMatters } from "../../lib/labels";

/** Never decays: the backend treats a half-life this long as "forever". */
const FOREVER = 999990;

function Row({ k, children, mult }: { k: string; children: ReactNode; mult?: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-baseline gap-x-3 py-1.5 text-[13px]">
      <span className="text-white/55">{k}</span>
      <span className="min-w-0 text-[15px] leading-snug text-white/90">{children}</span>
      <span className="tabular-nums text-[15px] font-medium text-white">{mult}</span>
    </div>
  );
}

/** "9 days", "6 weeks", "2 months", "1.4 years": a length of time in plain words. */
function ageWords(days: number): string {
  const d = Math.max(0, days);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d < 14) return plural(Math.round(d), "day");
  if (d < 60) return plural(Math.round(d / 7), "week");
  if (d < 700) return plural(Math.round(d / 30.44), "month");
  return `${(d / 365).toFixed(1)} years`;
}

const have = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Why SPINE trusts a fact as much as it does, with the real numbers.
 * The lines multiply out to the confidence the backend returned:
 *   base × 0.5^(age / half-life) × min(1.5, 1 + 0.15·ln(sources)).
 * A line whose number the backend did not send is left out, never invented. */
export function ConfidenceMath({ claim }: { claim: Claim }) {
  const base = claim.base_conf;
  const half = claim.half_life_days;
  const age = claim.age_days;
  const sources = claim.source_count;

  const forever = have(half) && half >= FOREVER;
  const boost = have(sources) ? Math.min(1.5, 1 + 0.15 * Math.log(Math.max(1, sources))) : null;
  // The decay shown is whatever makes the numbers meet the backend's answer,
  // so this card can never disagree with the server by a rounding step.
  const decay =
    have(base) && base > 0 && boost !== null && claim.confidence < 0.9999
      ? claim.confidence / (base * boost)
      : have(half) && have(age)
        ? forever
          ? 1
          : 0.5 ** (age / half)
        : null;
  const label = confidenceLabel(claim.confidence);
  const x = (n: number) => `×${n.toFixed(2)}`;

  return (
    <div>
      <Row k="Fact">{claim.text}</Row>
      {have(base) && <Row k="Started at">{Math.round(base * 100)}%</Row>}
      {have(age) && have(half) && decay !== null && (
        <Row k="Age" mult={x(decay)}>
          {ageWords(age)} old
          {forever ? " · this kind of fact never fades" : ` · this kind of fact halves every ${Math.round(half)} days`}
        </Row>
      )}
      {boost !== null && have(sources) && (
        <Row k="Confirmed by" mult={x(boost)}>
          {sources} {sources === 1 ? "source" : "sources"}
        </Row>
      )}
      <div className="mt-1 border-t border-white/12 pt-2">
        <Row k="Now" mult={`${label.percent}%`}>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${confidenceBgClass(label.token)}`} />
            {label.label}
          </span>
        </Row>
      </div>
      {have(base) && decay !== null && boost !== null && (
        <p className="mt-1 text-[13px] text-white/55">
          {Math.round(base * 100)}% {x(decay)} {x(boost)} = {label.percent}%
        </p>
      )}
    </div>
  );
}

/** The plain reason a finding exists, with the numbers when there are some. */
export function WhyFlagged({ finding, claims }: { finding: Finding; claims: Claim[] }) {
  const kind = finding.kind;
  // For a fading fact: the claim about this thing that has faded the most.
  const claim =
    kind === "decay"
      ? claims
          .filter((c) => c.id === finding.target_id || c.about?.id === finding.target_id)
          .sort((a, b) => a.confidence - b.confidence)[0]
      : undefined;
  const how: Record<string, string> = {
    bus_factor: "SPINE counted the people who currently own it. Fewer than two names came back.",
    orphan:
      "SPINE looked for a current owner and found none, and nothing else depends on it, so nobody would notice it break.",
    contradiction: "Two facts about the same thing say opposite things, so at least one of them is wrong.",
    verification_requested: "Someone asked Vera to check this fact with a person.",
    decay: "Facts lose trust as they age. This one has lost enough that SPINE wants a person to confirm it.",
  };
  const detail = plainDetail(finding.detail);
  return (
    <div className="flex flex-col gap-2 text-[15px] leading-snug">
      <p className="text-white/90">{whyItMatters(finding)}</p>
      <p className="text-[13px] text-white/65">{how[kind] ?? "SPINE's checks found it."}</p>
      {detail && kind !== "decay" && <p className="text-[13px] text-white/65">{detail}</p>}
      {claim && (
        <div className="mt-1 rounded-xl bg-white/[0.06] p-3">
          <ConfidenceMath claim={claim} />
        </div>
      )}
      <p className="text-[13px] text-white/50">
        {finding.basis === "llm"
          ? "Found with the help of a language model, checked against the graph."
          : finding.basis === "human"
            ? "Raised by a person."
            : "Found by counting what is in the graph; no guessing involved."}
      </p>
    </div>
  );
}

type Person = {
  id: string;
  name: string;
  role: string | null;
  team: string | null;
  has_left: boolean;
  left_at: number | null;
  owns: { id: string; name: string }[];
};

let peopleCache: Person[] | null = null;

/** A short card for someone on the graph. */
export function PersonCard({ id, fallbackName }: { id: string; fallbackName: string }) {
  const [person, setPerson] = useState<Person | null | undefined>(
    peopleCache ? (peopleCache.find((p) => p.id === id) ?? null) : undefined
  );
  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/api/people`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { people?: Person[] } | null) => {
        if (cancelled || !d?.people) return;
        peopleCache = d.people;
        setPerson(d.people.find((p) => p.id === id) ?? null);
      })
      .catch(() => !cancelled && setPerson((p) => p ?? null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const name = person?.name ?? fallbackName;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[15px] font-semibold"
          style={avatarStyle(name)}
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{name}</p>
          <p className="truncate text-[13px] text-white/65">
            {[person?.role, person?.team].filter(Boolean).join(" · ") || (person === undefined ? "Loading…" : "")}
          </p>
        </div>
      </div>
      {person?.has_left && (
        <p className="text-[13px] text-aging">
          Has left the company
          {person.left_at
            ? ` (${new Date(person.left_at * 1000).toLocaleDateString([], { month: "short", year: "numeric" })})`
            : ""}
          .
        </p>
      )}
      {person && !person.has_left && (
        <p className="text-[13px] text-white/75">
          {person.owns.length
            ? `Looks after ${person.owns.map((o) => displayName(o.name, o.name)).join(", ")}.`
            : "Doesn't own anything in their own right at the moment."}
        </p>
      )}
      {person === null && <p className="text-[13px] text-white/65">SPINE has nothing more on them.</p>}
    </div>
  );
}
