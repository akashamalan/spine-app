"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import TextType from "./TextType";

const GradientASCII = dynamic(() => import("./GradientASCII"), { ssr: false });

const WORDS = [
  "to SPINE.",
  "to the team.",
  "aboard.",
  "back.",
  "to your company's memory.",
  "to the brain that asks you.",
];

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", var(--font-inter), "Segoe UI", system-ui, sans-serif';

// The new screen is always black, so the gradient is always the dark variant.
const light = false;

export function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [hint, setHint] = useState(false);
  const done = useRef(false);

  const go = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    setTimeout(onEnter, 600);
  }, [onEnter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => setHint(true), 3500);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [go]);

  return (
    <div
      onClick={go}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#000",
        cursor: "pointer",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(1.03)" : "scale(1)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <GradientASCII
          colors={["#1e3fd8", "#f6f8ff", "#a5d8ff", "#4dcaff"]}
          shape="horizon"
          characters=" =+xX0S8#@"
          cellSize={18}
          density={0.8}
          glyphOpacity={0.85}
          glow={0.2}
          depthOfField={0}
          flicker={0.2}
          softness={0.5}
          scale={1}
          flow={0.5}
          speed={1}
          gradientOpacity={0.9}
          grain={0.08}
          variation={0}
          mouseInteraction
          scrambleRadius={0.1}
          clickEffect="wave"
          intro
          lightMode={light}
          dpr={undefined}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 10,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "0 6vw 12vh 9vw",
          textAlign: "center",
          color: "#fff",
          fontFamily: FONT,
        }}
      >
        <div style={{ width: "min(92vw, 22em)", fontSize: "clamp(2rem, 5.2vw, 4rem)", textAlign: "left" }}>
          <h1
            style={{
              margin: 0,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1.12,
              minHeight: "2.3em",
              fontSize: "inherit",
            }}
          >
            <span>Welcome</span>{" "}
            <span style={{ color: "#a5d8ff" }}>
              <TextType
                as="span"
                text={WORDS}
                typingSpeed={60}
                deletingSpeed={30}
                pauseDuration={1600}
                loop
                showCursor
                cursorCharacter="|"
                variableSpeed={undefined}
                onSentenceComplete={undefined}
              />
            </span>
          </h1>
        </div>

        <p
          style={{
            position: "absolute",
            bottom: "6vh",
            fontSize: "0.8125rem",
            letterSpacing: "0.01em",
            color: "rgba(255,255,255,0.55)",
            opacity: hint ? 1 : 0,
            transition: "opacity 1s ease",
          }}
        >
          Press Enter
        </p>
      </div>
    </div>
  );
}
