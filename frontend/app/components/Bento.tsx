"use client";
import type { ReactNode } from "react";

function Panel({ title, hint, className = "", children }: { title?: string; hint?: string; className?: string; children?: ReactNode }) {
  return (
    <section className={`glass backdrop-blur-[28px] backdrop-saturate-[180%] flex min-h-0 flex-col overflow-hidden rounded-[28px] text-white ${className}`}>
      {title && (
        <header className="px-6 pt-5 pb-3">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-white/60">{hint}</p>}
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-5 pt-1">{children}</div>
    </section>
  );
}

export function Bento({ left, graph, answer, ask, right }: { left?: ReactNode; graph?: ReactNode; answer?: ReactNode; ask?: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative z-10 h-screen w-full p-4 md:p-6">
      <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[minmax(240px,1fr)_minmax(0,2.2fr)_minmax(240px,1fr)] md:grid-rows-[1fr_1.2fr_auto] md:gap-5">
        <Panel className="md:col-start-1 md:row-start-1 md:row-span-3" title="What SPINE noticed" hint="Problems it found on its own">{left}</Panel>
        <Panel className="md:col-start-2 md:row-start-1" title="How SPINE found it" hint="The path it walked through your company">{graph}</Panel>
        <Panel className="md:col-start-2 md:row-start-2" title="The answer" hint="What SPINE knows, and how sure it is">{answer}</Panel>
        <Panel className="md:col-start-2 md:row-start-3">{ask}</Panel>
        <Panel className="md:col-start-3 md:row-start-1 md:row-span-3" title="Vera" hint="Questions waiting for a human">{right}</Panel>
      </div>
    </div>
  );
}
