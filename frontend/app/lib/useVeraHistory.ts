"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "./useSpine";
import { apiFetch } from "./identity";

/** One answered question: what Vera asked, the person's own words, and what
 * changed because of them. From /api/vera/history. */
export type HistoryItem = {
  task_id: string;
  question: string;
  subject: string | null;
  subject_id: string | null;
  claim_id: string | null;
  original_fact: string | null;
  /** Exactly what the person typed. */
  human_answer: string | null;
  verdict: string | null;
  changes: string[];
  answered_by: string | null;
  answered_at: number | null;
  asked_at: number | null;
  /** The fact that replaced it, when the answer corrected it. */
  replaced_by: string | null;
};

/** Everyone's answered questions, newest first. Re-read whenever `refreshKey`
 * changes (a new finding, a new question), so the feed follows the stream. */
export function useVeraHistory(refreshKey: unknown): { items: HistoryItem[]; loaded: boolean } {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/api/vera/history?limit=200`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { history?: HistoryItem[] } | null) => {
        if (cancelled || !d) return;
        setItems(d.history ?? []);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return { items, loaded };
}
