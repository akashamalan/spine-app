"use client";

import { useState } from "react";
import { Home } from "./components/Home";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { WhoAreYou } from "./components/WhoAreYou";
import { useIdentity } from "./lib/identity";

// Types moved to lib/types.ts; re-exported so existing imports keep working.
export type {
  BackendStatus,
  Evidence,
  Finding,
  HopEvent,
  HopResult,
  VeraProbe,
} from "./lib/types";

export default function Page() {
  const [showWelcome, setShowWelcome] = useState(true);
  const identity = useIdentity();

  return (
    <>
      {showWelcome && <WelcomeScreen onEnter={() => setShowWelcome(false)} />}
      {/* Right after the welcome, and again whenever "Switch person" clears it. */}
      {!showWelcome && !identity && <WhoAreYou />}
      <Home welcomeDone={!showWelcome} />
    </>
  );
}
