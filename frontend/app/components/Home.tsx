"use client";

import { useEffect, useState } from "react";
import { GraphPanel } from "./graph/GraphPanel";
import { VeraOverlay } from "./VeraOverlay";
import { Backdrop } from "./Backdrop";
import { Bento, type MobileView } from "./Bento";
import { ActionToast, BottomPill, MobileSwitcher, OutageToasts, TopPill } from "./Pills";
import { NoticedPanel } from "./NoticedPanel";
import { AskBar, askBlockedReason } from "./AskBar";
import { AnswerView } from "./AnswerView";
import { useSpine } from "../lib/useSpine";
import { displayName } from "../lib/labels";

const RECENT_KEY = "spine-recent-questions";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

/**
 * The bento home. `welcomeDone` gates the backdrop so the welcome screen's
 * canvas and this one are never alive at the same time.
 */
export function Home({ welcomeDone }: { welcomeDone: boolean }) {
  const spine = useSpine();
  const { findings, hops, probes, selectedFinding, backend, stats } = spine;

  const [mobileView, setMobileView] = useState<MobileView>("ask");
  const [question, setQuestion] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [showVera, setShowVera] = useState(false);

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => {
    const t = setTimeout(() => setRecent(readRecent()), 0);
    return () => clearTimeout(t);
  }, []);

  const blocked = askBlockedReason(backend) !== null;

  /** Every ask goes through here: fill the bar, remember it, show the answer. */
  const askQuestion = (q: string) => {
    const text = q.trim();
    if (!text || spine.isAsking || blocked) return;
    setQuestion(text);
    spine.setSelectedFinding(null);
    setMobileView("ask");
    setRecent((prev) => {
      const next = [text, ...prev.filter((x) => x !== text)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: recent questions just won't survive a reload.
      }
      return next;
    });
    spine.ask(text);
  };

  const isEmpty = spine.askStatus === "idle" && !selectedFinding;

  return (
    <div className="spine-dark relative min-h-dvh text-white">
      {welcomeDone && <Backdrop />}

      <TopPill backend={backend} isScanning={spine.isScanning} onScan={spine.scan} />
      <OutageToasts backend={backend} />
      <MobileSwitcher view={mobileView} onChange={setMobileView} />

      <Bento
        mobileView={mobileView}
        left={
          <NoticedPanel
            findings={findings}
            selected={selectedFinding}
            onSelect={(f) => {
              spine.setSelectedFinding(f);
              // On a phone the detail lives in the Ask view.
              if (f) setMobileView("ask");
            }}
          />
        }
        graph={
          <GraphPanel
            hops={hops}
            status={spine.askStatus}
            highlightId={selectedFinding?.target_id ?? null}
            backendUp={backend.graph === "up"}
          />
        }
        answer={
          <AnswerView
            status={spine.askStatus}
            answer={spine.answer}
            evidence={spine.evidence}
            replaced={spine.replaced}
            factDates={spine.factDates}
            hops={hops}
            error={spine.askError}
            selectedFinding={selectedFinding}
            onCloseFinding={() => spine.setSelectedFinding(null)}
            onAsk={askQuestion}
            onRetry={() => askQuestion(spine.lastQuestion)}
            onFeedback={() => spine.feedback()}
            notify={spine.notify}
            askDisabled={blocked}
          />
        }
        ask={
          <AskBar
            value={question}
            onChange={setQuestion}
            onAsk={askQuestion}
            onStop={spine.stopAsking}
            isAsking={spine.isAsking}
            backend={backend}
            recent={recent}
            showExamples={!isEmpty}
          />
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
