"use client";

import { useEffect, useRef, useState } from "react";
import { PulsePanel } from "./PulsePanel";
import { StagePanel } from "./StagePanel";
import { AnswerPanel } from "./AnswerPanel";
import { VeraOverlay } from "./VeraOverlay";
import { Backdrop } from "./Backdrop";
import { Bento, type MobileView } from "./Bento";
import { ActionToast, BottomPill, MobileSwitcher, OutageToasts, TopPill } from "./Pills";
import { useSpine } from "../lib/useSpine";
import { displayName } from "../lib/labels";

/**
 * The bento home. `welcomeDone` gates the backdrop so the welcome screen's
 * canvas and this one are never alive at the same time.
 */
export function Home({ welcomeDone }: { welcomeDone: boolean }) {
  const spine = useSpine();
  const { findings, hops, answer, evidence, probes, selectedFinding, backend, stats } = spine;

  const [mobileView, setMobileView] = useState<MobileView>("ask");
  const [question, setQuestion] = useState("");
  const [showVera, setShowVera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K (Mac) / Ctrl+K (Windows) focuses the question input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const send = () => {
    const q = question.trim();
    if (q) spine.ask(q);
  };

  return (
    <div className="spine-dark relative min-h-dvh text-white">
      {welcomeDone && <Backdrop />}

      <TopPill backend={backend} isScanning={spine.isScanning} onScan={spine.scan} />
      <OutageToasts backend={backend} />
      <MobileSwitcher view={mobileView} onChange={setMobileView} />

      <Bento
        mobileView={mobileView}
        left={
          <PulsePanel
            findings={findings}
            onSelect={spine.setSelectedFinding}
            selected={selectedFinding}
          />
        }
        graph={<StagePanel hops={hops} isAsking={spine.isAsking} />}
        answer={
          <AnswerPanel
            answer={answer}
            evidence={evidence}
            hops={hops}
            selectedFinding={selectedFinding}
          />
        }
        ask={
          <div className="glass-strong flex h-14 items-center gap-2 rounded-full pl-5 pr-2">
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask SPINE how your company works…"
              aria-label="Ask SPINE a question"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder:text-white/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={spine.isAsking || !question.trim()}
              className="h-10 rounded-full bg-primary px-5 text-[15px] font-medium text-white active:scale-[0.97] disabled:opacity-50"
            >
              {spine.isAsking ? "Thinking…" : "Ask"}
            </button>
          </div>
        }
        right={
          <div className="flex flex-col gap-3">
            <p className="text-[15px] text-white/90">
              {probes.length === 0
                ? "Nothing to confirm right now."
                : `${probes.length} ${probes.length === 1 ? "question needs" : "questions need"} a person.`}
            </p>
            <ul className="flex flex-col gap-1.5">
              {probes.map((p) => (
                <li key={p.task_id} className="text-[13px] text-white/75">
                  About {displayName(p.target_name, "something in the graph")}
                </li>
              ))}
            </ul>
            {probes.length > 0 && (
              <button
                type="button"
                onClick={() => setShowVera(true)}
                className="self-start rounded-full bg-white/10 px-4 py-2 text-[13px] font-medium hover:bg-white/15 active:scale-[0.97]"
              >
                Answer Vera&apos;s questions
              </button>
            )}
          </div>
        }
      />

      <BottomPill
        backend={backend}
        facts={stats.knowledgeNodes}
        connections={stats.knowledgeEdges}
        findings={findings.length}
        questions={probes.length}
      />
      <ActionToast toast={spine.toast} onDismiss={spine.dismissToast} />

      {showVera && (
        <VeraOverlay
          probes={probes}
          onClose={() => setShowVera(false)}
          onRespond={async (probeId, text) => {
            await spine.respond(probeId, text);
          }}
        />
      )}
    </div>
  );
}
