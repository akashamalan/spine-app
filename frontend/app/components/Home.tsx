"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GraphPanel } from "./graph/GraphPanel";
import { VeraOverlay } from "./VeraOverlay";
import { Backdrop } from "./Backdrop";
import { Bento, type MobileView } from "./Bento";
import { ActionToast, BottomPill, MobileSwitcher, OutageToasts, TopPill } from "./Pills";
import { NoticedPanel } from "./NoticedPanel";
import { AskBar, askBlockedReason } from "./AskBar";
import { AnswerView } from "./AnswerView";
import { VeraList } from "./VeraList";
import { OSShell, type ShellBridge } from "../os/OSShell";
import type { GraphApi } from "../os/context/actions";
import type { Finding } from "../lib/types";
import { Simulation } from "../os/apps/Simulation";
import { setIdentity, useIdentity } from "../lib/identity";
import { useSpine } from "../lib/useSpine";
import { severityLabel } from "../lib/labels";

const RECENT_KEY = "spine-recent-questions";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** The desktop gets floating windows; a phone keeps the stacked layout. Null
 * until mounted, because the server cannot know how wide the screen is. */
function useDesktop(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

/**
 * The home screen. `welcomeDone` gates the backdrop so the welcome screen's
 * canvas and this one are never alive at the same time.
 */
export function Home({ welcomeDone }: { welcomeDone: boolean }) {
  const spine = useSpine();
  const { findings, hops, probes, selectedFinding, backend, stats } = spine;
  const desktop = useDesktop();
  const identity = useIdentity();

  const [mobileView, setMobileView] = useState<MobileView>("ask");
  const [question, setQuestion] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [showVera, setShowVera] = useState(false);
  // A node lit up from a right-click menu; a finding the person picked wins
  // over nothing, and this wins over a finding.
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  const graphApi = useRef<GraphApi | null>(null);

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
    setGraphFocus(null);
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

  // Built once and handed to whichever layout is on screen.
  const noticed = (
    <NoticedPanel
      findings={findings}
      selected={selectedFinding}
      onSelect={(f) => {
        setGraphFocus(null);
        spine.setSelectedFinding(f);
        // On a phone the detail lives in the Ask view.
        if (f) setMobileView("ask");
      }}
      claims={spine.claims}
      resolvedThisWeek={spine.resolvedThisWeek}
    />
  );

  const graph = (
    <GraphPanel
      hops={hops}
      status={spine.askStatus}
      highlightId={graphFocus ?? selectedFinding?.target_id ?? null}
      apiRef={graphApi}
      backendUp={backend.graph === "up"}
      companyMap={spine.companyMap}
      companyMapFailed={spine.companyMapFailed}
    />
  );

  const answer = (
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
  );

  const ask = (
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
  );

  const askProblem = spine.isAsking ? "SPINE is still working on your last question." : askBlockedReason(backend);
  const bridge = useMemo<ShellBridge>(
    () => ({
      claims: spine.claims,
      evidence: spine.evidence,
      ask: askQuestion,
      askProblem,
      notify: spine.notify,
      highlight: setGraphFocus,
      showFinding: (f: Finding) => {
        setGraphFocus(null);
        spine.setSelectedFinding(f);
      },
      graphApi,
      veraAsk: spine.veraAsk,
      feedback: spine.feedback,
    }),
    // askQuestion closes over the latest question state; it is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spine.claims, spine.evidence, askProblem, spine.notify, spine.veraAsk, spine.feedback, spine.setSelectedFinding, spine.isAsking, blocked, recent]
  );

  const urgentCount = findings.filter((f) => severityLabel(f.severity) === "Urgent").length;

  return (
    <div className="spine-dark relative min-h-dvh text-white">
      {welcomeDone && <Backdrop />}

      {/* Nobody is picked yet (or "Switch person" was used): the picker is up. */}
      {desktop === true && identity && (
        <OSShell
          bridge={bridge}
          panels={{
            noticed,
            graph,
            answer,
            ask,
            sim: (
              <Simulation
                simulate={spine.simulate}
                simRunning={spine.simRunning}
                lastSim={spine.lastSim}
                findings={findings}
                probes={probes}
              />
            ),
          }}
          probes={probes}
          probesReady={spine.probesReady}
          identity={identity}
          onSwitchPerson={() => setIdentity(null)}
          onAnswerVera={() => setShowVera(true)}
          stats={stats}
          findingCount={findings.length}
          urgentCount={urgentCount}
          backend={backend}
          isScanning={spine.isScanning}
          onScan={spine.scan}
          askStatus={spine.askStatus}
          answerText={spine.answer}
        />
      )}

      {desktop === false && (
        <>
          <TopPill backend={backend} isScanning={spine.isScanning} onScan={spine.scan} />
          <MobileSwitcher view={mobileView} onChange={setMobileView} />
          <Bento
            mobileView={mobileView}
            streaming={spine.askStatus === "asking"}
            left={noticed}
            graph={graph}
            answer={answer}
            ask={ask}
            right={<VeraList probes={probes} onAnswer={() => setShowVera(true)} />}
          />
          <BottomPill
            backend={backend}
            facts={stats.knowledgeNodes}
            connections={stats.knowledgeEdges}
            findings={findings.length}
            questions={probes.length}
          />
        </>
      )}

      <OutageToasts backend={backend} />
      <ActionToast toast={spine.toast} onDismiss={spine.dismissToast} />

      {showVera && (
        <VeraOverlay
          probes={probes}
          onClose={() => setShowVera(false)}
          onRespond={(probeId, text) => spine.respond(probeId, text)}
        />
      )}
    </div>
  );
}
