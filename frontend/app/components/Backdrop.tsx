"use client";
import dynamic from "next/dynamic";
import { usePrefs, type Wallpaper } from "../lib/uiPrefs";

const GradientASCII = dynamic(() => import("./GradientASCII"), { ssr: false });

/** How lively the wallpaper is. The same one canvas throughout: only these two
 * knobs change, and the shader reads them live. */
const MOOD: Record<Wallpaper, { speed: number; flicker: number }> = {
  calm: { speed: 0.4, flicker: 0.05 },
  normal: { speed: 1, flicker: 0.2 },
  lively: { speed: 1.8, flicker: 0.4 },
};

export function Backdrop() {
  const { speed, flicker } = MOOD[usePrefs().wallpaper];
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "#000" }}>
      <GradientASCII
        colors={["#1e3fd8", "#f6f8ff", "#a5d8ff", "#4dcaff"]}
        shape="horizon"
        characters=" =+xX0S8#@"
        cellSize={18}
        density={0.8}
        glyphOpacity={0.85}
        glow={0.2}
        depthOfField={0}
        flicker={flicker}
        softness={0.5}
        scale={1}
        flow={0.5}
        speed={speed}
        gradientOpacity={0.9}
        grain={0.08}
        variation={0}
        mouseInteraction
        scrambleRadius={0.1}
        clickEffect="wave"
        intro
        lightMode={false}
        dpr={undefined}
        style={{ width: "100%", height: "100%" }}
      />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.6))" }} />
    </div>
  );
}
