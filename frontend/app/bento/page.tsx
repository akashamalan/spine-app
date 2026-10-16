"use client";
import { Backdrop } from "../components/Backdrop";
import { Bento } from "../components/Bento";

export default function BentoPreview() {
  const soon = <p className="text-sm text-white/50">Coming next.</p>;
  return (
    <>
      <Backdrop />
      <Bento left={soon} graph={soon} answer={soon} ask={<p className="text-sm text-white/60">Ask SPINE anything about your company…</p>} right={soon} />
    </>
  );
}
