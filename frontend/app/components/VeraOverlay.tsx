"use client";

import { useState } from "react";
import type { VeraProbe } from "../page";

export function VeraOverlay({
  probes,
  onClose,
  onRespond,
}: {
  probes: VeraProbe[];
  onClose: () => void;
  /** Resolves true only when the backend accepted the answer. */
  onRespond: (probeId: string, answer: string) => Promise<boolean>;
}) {
  const [activeProbe, setActiveProbe] = useState<string | null>(
    probes[0]?.task_id || null
  );
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentProbe = probes.find((p) => p.task_id === activeProbe);

  const handleSubmit = async () => {
    if (!activeProbe || !responseText.trim()) return;
    setSubmitting(true);
    try {
      const accepted = await onRespond(activeProbe, responseText.trim());
      // Keep the question and the typed answer on screen if it was refused,
      // so nothing the human said is lost and they can try again.
      if (!accepted) return;
      setResponseText("");
      // Move to next probe
      const remaining = probes.filter((p) => p.task_id !== activeProbe);
      setActiveProbe(remaining[0]?.task_id || null);
      if (remaining.length === 0) {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-lg mx-4 bg-slab border border-rule rounded-xl shadow-2xl overflow-hidden animate-hop">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rule">
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg
                width="24"
                height="24"
                viewBox="0 0 18 18"
                fill="none"
                className="text-primary"
              >
                <circle
                  cx="9"
                  cy="9"
                  r="8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  opacity={0.6}
                />
                <path
                  d="M5 5L9 13L13 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Vera needs a human</h2>
              <p className="text-xs text-ink-faint">
                {probes.length} question{probes.length !== 1 ? "s" : ""} waiting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-sunk text-ink-faint hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Probe tabs */}
        {probes.length > 1 && (
          <div className="flex gap-1 px-5 pt-3 overflow-x-auto">
            {probes.map((p, i) => (
              <button
                key={p.task_id}
                onClick={() => setActiveProbe(p.task_id)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors shrink-0 ${
                  activeProbe === p.task_id
                    ? "bg-accent-soft text-primary font-medium"
                    : "text-ink-faint hover:text-ink-soft hover:bg-sunk"
                }`}
              >
                {p.target_name || `Q${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Current probe */}
        {currentProbe && (
          <div className="px-5 py-4">
            {/* Context */}
            <div className="mb-3 p-3 bg-sunk rounded-lg">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-signal">
                  {currentProbe.finding_kind.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-ink-faint">
                  on {currentProbe.target_name}
                </span>
              </div>
              <p className="text-sm text-ink-soft">{currentProbe.question}</p>
            </div>

            {/* Response input */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold">
                Your answer
              </label>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Type what you know..."
                rows={3}
                className="w-full mt-1.5 px-3 py-2 text-sm bg-paper border border-rule rounded-md focus:outline-none focus:border-primary placeholder:text-ink-faint resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px] text-ink-faint">
                Your answer updates the graph — Vera never guesses
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting || !responseText.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Saving..." : "Answer Vera"}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!currentProbe && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-ink-faint">
              All questions answered. Vera is content.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
