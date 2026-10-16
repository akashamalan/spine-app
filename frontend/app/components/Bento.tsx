"use client";
import type { ReactNode } from "react";

/** Which single panel a phone shows (desktop shows all of them). */
export type MobileView = "noticed" | "ask" | "vera";

function Panel({
  title,
  hint,
  className = "",
  bodyClassName = "px-6 pb-5 pt-1 overflow-auto",
  children,
}: {
  title?: string;
  hint?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`glass flex min-h-0 flex-col overflow-hidden rounded-[28px] ${className}`}
    >
      {title && (
        <header className="shrink-0 px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-white/70">{hint}</p>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Bento({
  left,
  graph,
  answer,
  ask,
  right,
  mobileView,
  streaming = false,
}: {
  left?: ReactNode;
  graph?: ReactNode;
  answer?: ReactNode;
  ask?: ReactNode;
  right?: ReactNode;
  mobileView: MobileView;
  /** An answer is actively streaming: the graph gets more room, the answer less. */
  streaming?: boolean;
}) {
  // Below md only the chosen view is shown; md and up always show all five.
  const on = (view: MobileView) => (mobileView === view ? "flex" : "hidden md:flex");

  return (
    <div className="relative z-10 h-dvh w-full px-4 pt-[124px] pb-[72px] md:px-6 md:pt-20 md:pb-16">
      <div
        className={`grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-4 transition-[grid-template-rows] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] md:grid-cols-[minmax(260px,1fr)_minmax(0,2.2fr)_minmax(260px,1fr)] md:gap-5 ${
          streaming
            ? "md:grid-rows-[minmax(320px,1.4fr)_minmax(0,1fr)_auto]"
            : "md:grid-rows-[minmax(320px,1fr)_minmax(0,1.2fr)_auto]"
        }`}
      >
        <Panel
          className={`${on("noticed")} row-span-2 md:col-start-1 md:row-start-1 md:row-span-3`}
          title="What SPINE noticed"
          hint="Problems it found on its own"
          bodyClassName="flex flex-col"
        >
          {left}
        </Panel>
        {/* The graph owns its own header (title, hint, Fit/drawer/expand buttons)
            so it can carry that chrome with it when it pops out full-screen. */}
        <Panel
          className="hidden md:flex md:col-start-2 md:row-start-1"
          bodyClassName="flex min-h-0 flex-1 flex-col"
        >
          {graph}
        </Panel>
        <Panel
          className={`${on("ask")} md:col-start-2 md:row-start-2`}
          title="The answer"
          hint="What SPINE knows, and how sure it is"
        >
          {answer}
        </Panel>
        <div className={`${mobileView === "ask" ? "block" : "hidden md:block"} md:col-start-2 md:row-start-3`}>
          {ask}
        </div>
        <Panel
          className={`${on("vera")} row-span-2 md:col-start-3 md:row-start-1 md:row-span-3`}
          title="Vera"
          hint="Questions waiting for a person"
        >
          {right}
        </Panel>
      </div>
    </div>
  );
}
