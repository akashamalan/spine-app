"use client";

import { createContext, useContext, type RefObject } from "react";
import type { Claim, Evidence, FeedbackResult, Finding, Toast } from "../../lib/types";
import type { Identity } from "../../lib/identity";
import type { WinId } from "../presets";

/** What a right-click menu can do to the rest of the app. Built once in the
 * shell and read by whichever component is being right-clicked, so a menu
 * never needs to know how SPINE is wired together. */

/** The graph window's own controls, registered by the graph panel. */
export type GraphApi = {
  fit: () => void;
  toggleDrawer: () => void;
  toggleLegend: () => void;
  legendHidden: boolean;
  /** The Cypher of the last step that ran one, if any step did. */
  lastCypher: () => string | null;
};

export type Actions = {
  me: Identity;
  isAdmin: boolean;
  claims: Claim[];
  answer: string;
  evidence: Evidence[];
  /** Ask a question: fills the bar, opens Ask + Graph + Answer, and submits. */
  askSpine: (text: string, opts?: { source?: string }) => void;
  focusAsk: () => void;
  /** The windows this person may have (administrators get more). */
  allowed: WinId[];
  openWindow: (id: WinId) => void;
  copy: (text: string, what?: string) => void;
  notify: (toast: Toast) => void;
  /** Light up a node on the graph (null clears it). */
  highlight: (id: string | null) => void;
  /** Show a finding on the graph and in the answer panel. */
  showFinding: (f: Finding) => void;
  graphApi: RefObject<GraphApi | null>;
  /** Admin: have Vera check these facts with a person. */
  veraAsk: (claimIds: string[], note?: string) => Promise<boolean>;
  /** 👎 on the current answer. */
  feedback: () => Promise<FeedbackResult>;
  scan: () => void;
};

const ActionsCtx = createContext<Actions | null>(null);
export const ActionsProvider = ActionsCtx.Provider;
/** Null on a phone, where there are no windows and no menus. */
export const useActions = () => useContext(ActionsCtx);
