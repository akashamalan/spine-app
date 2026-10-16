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
