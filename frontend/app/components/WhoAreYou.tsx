"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { API_BASE } from "../lib/useSpine";
import { setIdentity, type Role } from "../lib/identity";
import { avatarStyle, initials } from "../lib/people";

type Person = { id: string; name: string; role: string | null; has_left: boolean };

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: "admin", label: "Administrator", hint: "Sees everything and can run the demo" },
  { id: "viewer", label: "Employee", hint: "Asks questions and answers Vera's" },
];

/** Shown once, right after the welcome screen. This is demo sign-in only: no
 * password, and the server simply believes what it is told. */
export function WhoAreYou() {
  const reduce = useReducedMotion();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/people`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { people?: Person[] }) => {
        if (cancelled) return;
        setPeople((d.people ?? []).filter((p) => !p.has_left));
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="who-title"
        className="glass-strong w-full max-w-[640px] rounded-[28px] p-6 text-white md:p-8"
      >
        <h2 id="who-title" className="text-[20px] font-semibold tracking-tight">
          Who are you?
        </h2>
        <p className="mt-1 text-[15px] text-white/75">
          Pick a person from the company. This is a demo, so there is no password.
        </p>

        <div role="radiogroup" aria-label="Role" className="mt-5 grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={role === r.id}
              onClick={() => setRole(r.id)}
              className={`rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-white ${
                role === r.id ? "bg-white/20" : "bg-white/[0.07] hover:bg-white/[0.12]"
              }`}
            >
              <span className="block text-[15px] font-medium">{r.label}</span>
              <span className="mt-0.5 block text-[13px] text-white/70">{r.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-5">
          {failed && (
            <div className="rounded-2xl bg-white/[0.07] p-4">
              <p className="text-[15px]">SPINE&apos;s server didn&apos;t answer, so there is nobody to pick yet.</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="mt-3 rounded-full bg-white/15 px-4 py-2 text-[13px] font-medium hover:bg-white/25"
              >
                Try again
              </button>
            </div>
          )}
          {!failed && !people && <p className="text-[15px] text-white/70">Loading people…</p>}
          {people && (
            <ul className="grid max-h-[320px] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setIdentity({ personId: p.id, name: p.name, role })}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.07] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
                      style={avatarStyle(p.name)}
                    >
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{p.name}</span>
                      <span className="block truncate text-[13px] text-white/70">{p.role}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
