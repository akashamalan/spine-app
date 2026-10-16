"use client";

import { useState } from "react";
import { Home } from "./components/Home";
import { WelcomeScreen } from "./components/WelcomeScreen";

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

  return (
    <>
      {showWelcome && <WelcomeScreen onEnter={() => setShowWelcome(false)} />}
      <Home />
    </>
  );
}
