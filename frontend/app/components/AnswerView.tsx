"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Copy, RotateCcw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import TextType from "./TextType";
import { EXAMPLE_QUESTIONS } from "./AskBar";
import type {
  AskStatus,
  Evidence,
  FeedbackResult,
  Finding,
  HopEvent,
  ReplacedFact,
  Toast,
} from "../lib/types";
import {
  confidenceBgClass,
  confidenceLabel,
  displayName,
  findingTitle,
  isRawId,
  plainDetail,
  relativeTime,
  severityDotClass,
  severityLabel,
  shortDate,
  stepLabel,
  whyItMatters,
} from "../lib/labels";
import { avatarStyle, initials } from "../lib/people";

const SPRING = { type: "spring", bounce: 0, duration: 0.4 } as const;
const WORD_MS = 25;

const pressable = "transition-[transform,background-color] active:scale-[0.97]";

type Person = { name: string; role?: string };

// ── Reading the walk ─────────────────────────────────────────────────────

/** The thing the question resolved to, once the walk has found it. */
function subjectOf(hops: HopEvent[]): string | null {
  for (const h of hops) {
    if (h.tool === "resolve_entity" && h.action === "result" && h.entity?.name) {
      return h.entity.name;
    }
  }
  return null;
}

type Step = { key: string; label: string; done: boolean };

/** One plain-words line per step the backend has started. */
function stepsOf(hops: HopEvent[]): Step[] {
  const subject = subjectOf(hops);
  const steps: Step[] = [];
  for (const h of hops) {
    if (h.action !== "checking") continue;
    const done = hops.some((r) => r.hop === h.hop && r.action !== "checking");
    steps.push({ key: `${h.hop}-${h.tool}`, label: stepLabel(h.tool, subject), done });
  }
  return steps;
}

type OwnershipRecord = { owner_name?: string; owner_active?: boolean; status?: string };
type KnowsPerson = { name?: string; job_title?: string };

function ownershipOf(hops: HopEvent[]): { records: OwnershipRecord[]; hasGap: boolean } {
  const h = hops.find((x) => x.tool === "broken_path" && x.action === "result");
  const records = Array.isArray(h?.ownership_records) ? (h.ownership_records as OwnershipRecord[]) : [];
  return { records, hasGap: h?.has_gap === true };
}

/** People worth talking to: current owners and people who know the subject. */
function peopleOf(hops: HopEvent[], answer: string): Person[] {
  const found = new Map<string, Person>();
  for (const h of hops) {
    if (h.tool === "who_knows" && Array.isArray(h.people)) {
      for (const p of h.people as KnowsPerson[]) {
        if (p.name && !isRawId(p.name)) found.set(p.name, { name: p.name, role: p.job_title });
      }
    }
  }
  for (const r of ownershipOf(hops).records) {
    if (r.owner_active && r.owner_name && !isRawId(r.owner_name) && !found.has(r.owner_name)) {
      found.set(r.owner_name, { name: r.owner_name, role: "Owner" });
    }
  }
  const all = [...found.values()];
  // Prefer the people the answer actually names; otherwise they're still the right contacts.
  const named = all.filter((p) => answer.includes(p.name) || answer.includes(p.name.split(" ")[0]));
  return (named.length ? named : all).slice(0, 4);
}

// ── Pieces ───────────────────────────────────────────────────────────────

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />;
}

function Thinking({ hops }: { hops: HopEvent[] }) {
  const reduce = useReducedMotion();
  const steps = stepsOf(hops);
  const current = steps.find((s) => !s.done);
  return (
    <div aria-live="polite" className="flex flex-col gap-3 pt-2">
      <p className="text-[20px] font-medium leading-snug">
        {current?.label ?? (steps.length ? "Putting the answer together…" : "Reading your question…")}
      </p>
      <ol className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {steps.map((s) => (
            <motion.li
              key={s.key}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
              className={`flex items-center gap-2.5 text-[15px] ${s.done ? "text-white/70" : "text-white"}`}
            >
              {s.done ? (
                <Check aria-hidden size={15} className="shrink-0 text-fresh" />
              ) : (
                <span aria-hidden className="grid h-[15px] w-[15px] shrink-0 place-items-center">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                </span>
              )}
              {s.label}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}

/** The answer, revealed a word at a time (all at once under reduced motion). */
function WordReveal({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setShown((n) => {
        if (n >= words.length) {
          clearInterval(t);
          return n;
        }
        return n + 2; // a word and the space after it
      });
    }, WORD_MS);
    return () => clearInterval(t);
  }, [reduce, words.length]);

  return (
    <p className="text-[20px] font-medium leading-[1.45] text-white">
      <span className="sr-only">{text}</span>
      <span aria-hidden>{reduce ? text : words.slice(0, shown).join("")}</span>
    </p>
  );
}

/**
 * How sure the answer is: its least certain fact. Only facts of the kind the
 * question asked about count when there are any, so an old architecture note
 * can't make a fresh ownership answer look outdated.
 */
function answerConfidence(evidence: Evidence[], hops: HopEvent[]): number | null {
  if (evidence.length === 0) return null;
  const intent = hops.find((h) => h.tool === "classify_intent" && h.intent)?.intent;
  const onTopic = intent ? evidence.filter((e) => e.fact_type === intent) : [];
  const basis = onTopic.length ? onTopic : evidence;
  return Math.min(...basis.map((e) => e.confidence));
}

function ConfidencePill({ evidence, hops }: { evidence: Evidence[]; hops: HopEvent[] }) {
  const value = answerConfidence(evidence, hops);
  if (value === null) return null;
  const c = confidenceLabel(value);
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1 text-[13px] font-medium"
      title={`The least certain fact this answer rests on is ${c.percent}% likely to be right.`}
    >
      <Dot className={confidenceBgClass(c.token)} />
      {c.label}
      <span className="tabular-nums text-white/70">{c.percent}%</span>
    </span>
  );
}

function HeadsUp({ evidence, hops }: { evidence: Evidence[]; hops: HopEvent[] }) {
  const lines: string[] = [];
  const stale = evidence.filter((e) => e.stale).length;
  if (stale > 0) {
    lines.push(
      stale === 1
        ? "One of these facts might be outdated. Nobody has confirmed it in a long time."
        : `${stale} of these facts might be outdated. Nobody has confirmed them in a long time.`
    );
  }
  const { records, hasGap } = ownershipOf(hops);
  const left = records.filter((r) => r.owner_active === false && r.owner_name && !isRawId(r.owner_name));
  const current = records.filter((r) => r.owner_active && r.owner_name && !isRawId(r.owner_name));
  if (hasGap || (left.length > 0 && current.length === 0)) {
    lines.push("The owner has left, and nobody has taken over yet.");
  } else if (left.length > 0) {
    lines.push(`${left[0].owner_name} used to own this and has moved on. ${current[0].owner_name} owns it now.`);
  }
  if (lines.length === 0) return null;
  return (
    <div role="note" className="flex gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
      <Dot className="mt-1.5 bg-aging" />
      <div>
        <p className="text-[15px] font-medium">Heads up</p>
        {lines.map((l) => (
          <p key={l} className="text-[13px] leading-snug text-white/80">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function TalkTo({ people }: { people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-white/70">Talk to</p>
      <ul className="flex flex-wrap gap-2">
        {people.map((p) => (
          <li
            key={p.name}
            className="flex items-center gap-2.5 rounded-full bg-white/[0.07] py-1 pl-1 pr-4"
          >
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold"
              style={avatarStyle(p.name)}
            >
              {initials(p.name)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px]">{p.name}</span>
              {p.role && <span className="text-[13px] text-white/65">{p.role}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FactsUsed({
  evidence,
  replaced,
  factDates,
}: {
  evidence: Evidence[];
  replaced: ReplacedFact[];
  factDates: Record<string, number>;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (evidence.length === 0 && replaced.length === 0) return null;
  return (
    <div className="rounded-2xl bg-white/[0.04]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-[15px] font-medium hover:bg-white/[0.04] ${pressable}`}
      >
        Facts I used ({evidence.length})
        <ChevronDown
          aria-hidden
          size={18}
          className={`text-white/70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className="flex flex-col gap-2.5 px-4 pb-4"
          >
            {evidence.map((e) => {
              const c = confidenceLabel(e.confidence);
              const date = factDates[e.claim_id];
              return (
                <li key={e.claim_id} className="flex gap-3">
                  <Dot className={`mt-[7px] ${confidenceBgClass(c.token)}`} />
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-snug">{e.text}</span>
                    <span className="text-[13px] text-white/65">
                      {c.label}
                      {date ? ` · as of ${shortDate(date)}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
            {replaced.map((r) => (
              <li key={r.claim_id} className="flex gap-3 text-white/60">
                <Dot className="mt-[7px] bg-white/30" />
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug line-through decoration-white/40">{r.text}</span>
                  <span className="text-[13px]">Replaced by a newer answer</span>
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Actions({
  answer,
  onFeedback,
  notify,
}: {
  answer: string;
  onFeedback: () => Promise<FeedbackResult>;
  notify: (toast: Toast) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify({ title: "Couldn't copy.", lines: ["Your browser blocked the clipboard."] });
    }
  };

  const icon = `grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 disabled:cursor-default ${pressable}`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        className={`flex h-9 items-center gap-2 rounded-full px-3 text-[13px] text-white/85 hover:bg-white/10 ${pressable}`}
      >
        {copied ? <Check aria-hidden size={15} /> : <Copy aria-hidden size={15} />}
        {copied ? "Copied" : "Copy answer"}
      </button>
      <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
      <button
        type="button"
        aria-label="This helped"
        aria-pressed={vote === "up"}
        disabled={vote !== null}
        onClick={() => {
          setVote("up");
          notify({ title: "Glad it helped.", lines: [] });
        }}
        className={`${icon} ${vote === "up" ? "text-fresh" : "text-white/75"}`}
      >
        <ThumbsUp aria-hidden size={16} className={vote === "up" ? "fill-current" : ""} />
      </button>
      <button
        type="button"
        aria-label="This looks wrong"
        title="This looks wrong — Vera will check these facts with a person"
        aria-pressed={vote === "down"}
        disabled={vote !== null}
        onClick={async () => {
          setVote("down");
          await onFeedback();
        }}
        className={`${icon} ${vote === "down" ? "text-stale" : "text-white/75"}`}
      >
        <ThumbsDown aria-hidden size={16} className={vote === "down" ? "fill-current" : ""} />
      </button>
    </div>
  );
}

function Empty({ onAsk, disabled }: { onAsk: (q: string) => void; disabled: boolean }) {
  const reduce = useReducedMotion();
  const greeting = "Ask me how your company works.";
  return (
    <div className="flex h-full flex-col justify-center gap-5 pb-4">
      <p className="min-h-[1.5em] text-[20px] font-medium">
        {reduce ? (
          greeting
        ) : (
          <TextType
            as="span"
            text={[greeting]}
            typingSpeed={45}
            pauseDuration={1500}
            deletingSpeed={30}
            loop={false}
            showCursor
            cursorCharacter="|"
            variableSpeed={undefined}
            onSentenceComplete={undefined}
          />
        )}
      </p>
      <p className="text-[15px] text-white/75">
        Who owns what, how things are done, and how sure SPINE is about it. Try one of these:
      </p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(q)}
            className={`glass-thin rounded-full px-3.5 py-2 text-left text-[13px] text-white/90 hover:bg-white/10 disabled:opacity-50 ${pressable}`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function Problem({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex h-full flex-col justify-center gap-4 pb-4">
      <p className="text-[20px] font-medium leading-snug">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`flex h-10 items-center gap-2 self-start rounded-full bg-white/15 px-4 text-[15px] font-medium hover:bg-white/20 ${pressable}`}
        >
          <RotateCcw aria-hidden size={15} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

function FindingDetail({
  finding,
  onClose,
  onAsk,
  askDisabled,
}: {
  finding: Finding;
  onClose: () => void;
  onAsk: (q: string) => void;
  askDisabled: boolean;
}) {
  const target = displayName(finding.target_name, "");
  const question = target
    ? ["bus_factor", "orphan", "missing_owner"].includes(finding.kind)
      ? `Who owns ${target}?`
      : `What do we know about ${target}?`
    : null;
  const detail = plainDetail(finding.detail);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1 text-[13px] font-medium">
          <Dot className={severityDotClass(finding.severity)} />
          {severityLabel(finding.severity)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this problem"
          className={`grid h-9 w-9 place-items-center rounded-full text-white/75 hover:bg-white/10 hover:text-white ${pressable}`}
        >
          <X aria-hidden size={18} />
        </button>
      </div>
      <div>
        <p className="text-[20px] font-medium leading-snug">{findingTitle(finding)}</p>
        <p className="mt-1 text-[15px] text-white/80">{whyItMatters(finding)}</p>
      </div>
      {detail && (
        <div className="rounded-2xl bg-white/[0.05] px-4 py-3">
          <p className="text-[13px] font-medium text-white/70">What SPINE saw</p>
          <p className="mt-1 text-[15px] leading-snug">{detail}</p>
        </div>
      )}
      <p className="text-[13px] text-white/65">
        {target ? `About ${target} · ` : ""}noticed {relativeTime(finding.found_at)}
      </p>
      {question && (
        <button
          type="button"
          disabled={askDisabled}
          onClick={() => onAsk(question)}
          className={`self-start rounded-full bg-primary px-4 py-2 text-[15px] font-medium text-white disabled:opacity-50 ${pressable}`}
        >
          Ask: {question}
        </button>
      )}
    </div>
  );
}

// ── The panel ────────────────────────────────────────────────────────────

export function AnswerView({
  status,
  answer,
  evidence,
  replaced,
  factDates,
  hops,
  error,
  selectedFinding,
  onCloseFinding,
  onAsk,
  onRetry,
  onFeedback,
  notify,
  askDisabled,
}: {
  status: AskStatus;
  answer: string;
  evidence: Evidence[];
  replaced: ReplacedFact[];
  factDates: Record<string, number>;
  hops: HopEvent[];
  error: string | null;
  selectedFinding: Finding | null;
  onCloseFinding: () => void;
  onAsk: (q: string) => void;
  onRetry: () => void;
  onFeedback: () => Promise<FeedbackResult>;
  notify: (toast: Toast) => void;
  askDisabled: boolean;
}) {
  const reduce = useReducedMotion();

  let view: { key: string; node: ReactNode };
  if (selectedFinding && status !== "asking") {
    view = {
      key: `finding-${selectedFinding.finding_id}`,
      node: (
        <FindingDetail finding={selectedFinding} onClose={onCloseFinding} onAsk={onAsk} askDisabled={askDisabled} />
      ),
    };
  } else if (status === "asking") {
    view = { key: "asking", node: <Thinking hops={hops} /> };
  } else if (status === "error") {
    view = {
      key: "error",
      node: <Problem message={error ?? "Something went wrong while I was looking."} onRetry={askDisabled ? undefined : onRetry} />,
    };
  } else if (status === "stopped") {
    view = {
      key: "stopped",
      node: <Problem message="Stopped. Ask again whenever you're ready." onRetry={askDisabled ? undefined : onRetry} retryLabel="Ask again" />,
    };
  } else if (status === "done" && !answer.trim()) {
    view = {
      key: "empty-answer",
      node: <Problem message="I didn't get an answer back that time." onRetry={askDisabled ? undefined : onRetry} />,
    };
  } else if (status === "done") {
    view = {
      key: `answer-${answer}`,
      node: (
        <div className="flex flex-col gap-4 pt-1">
          <WordReveal text={answer} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConfidencePill evidence={evidence} hops={hops} />
            <Actions answer={answer} onFeedback={onFeedback} notify={notify} />
          </div>
          <HeadsUp evidence={evidence} hops={hops} />
          <TalkTo people={peopleOf(hops, answer)} />
          <FactsUsed evidence={evidence} replaced={replaced} factDates={factDates} />
        </div>
      ),
    };
  } else {
    view = { key: "empty", node: <Empty onAsk={onAsk} disabled={askDisabled} /> };
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view.key}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={reduce ? { duration: 0.15 } : SPRING}
        className="h-full"
      >
        {view.node}
      </motion.div>
    </AnimatePresence>
  );
}
