/**
 * The ONE place for plain-English wording.
 *
 * Rule: no raw ids (claim-…, vtask-…, finding-…) may ever reach a user.
 * Anything user-facing goes through a helper here. `isRawId` + `displayName`
 * exist so call sites can enforce that instead of trusting themselves.
 */

export type ConfidenceToken = "fresh" | "aging" | "stale";

// ── Finding kinds ────────────────────────────────────────────────────────

const FINDING_KINDS: Record<string, string> = {
  bus_factor: "Only one person knows this",
  orphan: "Nobody looks after this",
  decay: "This might be outdated",
  contradiction: "Two documents disagree",
  missing_owner: "The owner has left",
  user_doubt: "Someone thinks this is wrong",
  verification_requested: "Waiting to be re-checked",
};

export function findingLabel(kind: string | undefined | null): string {
  if (!kind) return "Something needs attention";
  return FINDING_KINDS[kind] ?? "Something needs attention";
}

// ── Confidence ───────────────────────────────────────────────────────────

/**
 * @param confidence 0–1 as stored on a Claim.
 */
export function confidenceLabel(confidence: number): {
  label: string;
  token: ConfidenceToken;
  percent: number;
} {
  const percent = Math.round((confidence ?? 0) * 100);
  if (percent >= 80) return { label: "Up to date", token: "fresh", percent };
  if (percent >= 60) return { label: "Getting old", token: "aging", percent };
  return { label: "Probably outdated", token: "stale", percent };
}

/** Tailwind text colour class for a confidence token. */
export function confidenceTextClass(token: ConfidenceToken): string {
  return token === "fresh"
    ? "text-fresh"
    : token === "aging"
      ? "text-aging"
      : "text-stale";
}

/** Tailwind background colour class for a confidence token. */
export function confidenceBgClass(token: ConfidenceToken): string {
  return token === "fresh"
    ? "bg-fresh"
    : token === "aging"
      ? "bg-aging"
      : "bg-stale";
}

// ── Age ──────────────────────────────────────────────────────────────────

/**
 * "confirmed 3 weeks ago", "confirmed 10 months ago".
 * Rounds to the largest unit that still reads naturally.
 */
export function ageText(days: number): string {
  const d = Math.max(0, Math.floor(days ?? 0));

  if (d === 0) return "confirmed today";
  if (d === 1) return "confirmed yesterday";
  if (d < 7) return `confirmed ${d} days ago`;

  if (d < 30) {
    const weeks = Math.round(d / 7);
    return `confirmed ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  if (d < 365) {
    const months = Math.round(d / 30);
    return `confirmed ${months} ${months === 1 ? "month" : "months"} ago`;
  }

  const years = Math.round((d / 365) * 10) / 10;
  const rounded = Number.isInteger(years) ? years : years.toFixed(1);
  return `confirmed ${rounded} ${years === 1 ? "year" : "years"} ago`;
}

/** Convenience for epoch-seconds timestamps coming off the graph. */
export function ageTextFromEpoch(epochSeconds: number): string {
  const days = (Date.now() / 1000 - epochSeconds) / 86400;
  return ageText(days);
}

// ── Severity ─────────────────────────────────────────────────────────────

export function severityLabel(severity: string | undefined | null): string {
  switch (severity) {
    case "critical":
    case "high":
      return "Urgent";
    case "medium":
      return "Soon";
    case "low":
      return "When you can";
    default:
      return "When you can";
  }
}

// ── Raw id guard ─────────────────────────────────────────────────────────

const RAW_ID = /^(claim|vtask|finding|run|resp|sys|person|team|doc|proj|dec)-/i;

/** True if the string looks like an internal id that must not be shown. */
export function isRawId(value: string | undefined | null): boolean {
  return !!value && RAW_ID.test(value.trim());
}

/**
 * Last line of defence before rendering a name. Prefers the human name and
 * never falls through to an internal id.
 */
export function displayName(
  name: string | undefined | null,
  fallback = "an unnamed item"
): string {
  const candidate = (name ?? "").trim();
  if (!candidate || isRawId(candidate)) return fallback;
  return candidate;
}

// ── Findings, in plain words ─────────────────────────────────────────────

type FindingLike = { kind: string; detail?: string | null };

/**
 * The finding's title. A bus-factor finding about a system with nobody
 * left at all is really "Nobody looks after this".
 */
export function findingTitle(f: FindingLike): string {
  if (f.kind === "bus_factor" && /\bNO active owner\b/.test(f.detail ?? "")) {
    return findingLabel("orphan");
  }
  return findingLabel(f.kind);
}

const WHY_IT_MATTERS: Record<string, string> = {
  bus_factor: "If that person is away, nobody else can help with it.",
  orphan: "If it breaks, there is nobody to call.",
  decay: "Nobody has confirmed it in a long time, so it may be wrong.",
  contradiction: "Two sources say different things, so one of them is wrong.",
  missing_owner: "Questions about it have nowhere to go.",
  user_doubt: "Someone who used this answer thinks it's wrong.",
  verification_requested: "Vera is checking it with a person.",
};

/** One line on why a new hire should care. */
export function whyItMatters(f: FindingLike): string {
  if (f.kind === "bus_factor" && /\bNO active owner\b/.test(f.detail ?? "")) {
    return WHY_IT_MATTERS.orphan;
  }
  return WHY_IT_MATTERS[f.kind] ?? "Someone should take a look at this.";
}

/**
 * The backend's detail sentence with the jargon taken out
 * ("Bus-factor = 1", "(medium tier)", quoting around names, raw ids).
 */
export function plainDetail(detail: string | undefined | null): string {
  return (detail ?? "")
    .replace(/\s*Bus-factor\s*=\s*\d+\.?/gi, "")
    .replace(/\s*\((?:low|medium|high|critical) tier\)/gi, "")
    .replace(/\bSystem '([^']+)'/g, "$1")
    .replace(/\bClaim '([^']+?)(?:\.\.\.)?'\s*\([a-z_]+\)/g, '"$1…"')
    .replace(/\bhas decayed to (\d+)% confidence/g, "is now only $1% likely to be right")
    .replace(/\b(?:claim|vtask|finding|run|resp|sys|person|team|doc|proj|dec)-[a-z0-9-]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type SeverityGroup = "Urgent" | "Soon" | "When you can";

/** Dot colour class for a severity: red, amber, or a calm blue. */
export function severityDotClass(severity: string | undefined | null): string {
  const label = severityLabel(severity);
  return label === "Urgent" ? "bg-stale" : label === "Soon" ? "bg-aging" : "bg-primary";
}

// ── Time ─────────────────────────────────────────────────────────────────

/** "just now", "2 min ago", "3 h ago", "yesterday", "5 days ago". */
export function relativeTime(epochSeconds: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.floor(nowMs / 1000 - epochSeconds));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} ${mo === 1 ? "month" : "months"} ago`;
  const y = Math.round(d / 365);
  return `${y} ${y === 1 ? "year" : "years"} ago`;
}

/** "12 Mar 2025" for an epoch-seconds date. */
export function shortDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── The walk, in plain words ─────────────────────────────────────────────

/**
 * What SPINE is doing during one step of an answer, for the thinking line.
 * `subject` is the thing the question resolved to, once known.
 */
export function stepLabel(tool: string | undefined, subject: string | null): string {
  const it = subject ? displayName(subject, "it") : "it";
  switch (tool) {
    case "classify_intent":
      return "Reading your question…";
    case "resolve_entity":
      return "Looking it up in your company's map…";
    case "who_knows":
      return `Finding who knows about ${it}…`;
    case "broken_path":
      return `Checking who owns ${it}…`;
    case "check_findings":
      return "Checking if that's still true…";
    case "find_entry_points":
      return "Searching for related facts…";
    case "neighbours":
    case "blast_radius":
    case "dependencies":
      return `Following what ${it} connects to…`;
    case "process_steps":
      return "Collecting the steps…";
    default:
      return "Looking through what SPINE knows…";
  }
}
