"use client";

import type { ReactNode } from "react";
import type { Identity } from "../../lib/identity";
import { setPrefs, usePrefs, type MotionPref, type Wallpaper } from "../../lib/uiPrefs";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium text-white/65">{title}</h3>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-white ${
            value === o.id ? "bg-white/20" : "bg-white/[0.07] hover:bg-white/[0.12]"
          }`}
        >
          <span className="block text-[15px] font-medium">{o.label}</span>
          {o.hint && <span className="block text-[13px] text-white/60">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function Settings({
  identity,
  onSwitchPerson,
  onResetLayout,
}: {
  identity: Identity;
  onSwitchPerson: () => void;
  onResetLayout: () => void;
}) {
  const prefs = usePrefs();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 pt-2">
      <Group title="Motion">
        <Segmented<MotionPref>
          label="Motion"
          value={prefs.motion}
          onChange={(motion) => setPrefs({ motion })}
          options={[
            { id: "system", label: "Follow my system", hint: "Uses your device's setting" },
            { id: "reduce", label: "Reduce", hint: "No bounce, no travel" },
          ]}
        />
      </Group>

      <Group title="Wallpaper">
        <Segmented<Wallpaper>
          label="Wallpaper"
          value={prefs.wallpaper}
          onChange={(wallpaper) => setPrefs({ wallpaper })}
          options={[
            { id: "calm", label: "Calm" },
            { id: "normal", label: "Normal" },
            { id: "lively", label: "Lively" },
          ]}
        />
      </Group>

      <Group title="Windows">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onResetLayout}
            className="rounded-full bg-white/12 px-4 py-2 text-[13px] font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
          >
            Reset layout
          </button>
          <label className="flex items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              checked={prefs.rememberLayout}
              onChange={(e) => setPrefs({ rememberLayout: e.target.checked })}
              className="h-4 w-4 accent-white"
            />
            Remember my layout
          </label>
        </div>
        {prefs.hiddenFindings.length > 0 && (
          <button
            type="button"
            onClick={() => setPrefs({ hiddenFindings: [] })}
            className="self-start rounded-full px-1 py-1 text-[13px] text-white/70 underline underline-offset-2 hover:text-white"
          >
            Show the {prefs.hiddenFindings.length} {prefs.hiddenFindings.length === 1 ? "thing" : "things"} I hid
          </button>
        )}
      </Group>

      <Group title="Person">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.07] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium">{identity.name}</p>
            <p className="text-[13px] text-white/65">{identity.role === "admin" ? "Administrator" : "Employee"}</p>
          </div>
          <button
            type="button"
            onClick={onSwitchPerson}
            className="shrink-0 rounded-full bg-white/12 px-4 py-2 text-[13px] font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
          >
            Switch person
          </button>
        </div>
      </Group>

      <Group title="About SPINE">
        <div className="flex flex-col gap-3 text-[15px] leading-snug text-white/90">
          <p>
            SPINE is a company brain that doesn&apos;t wait to be asked: it keeps a graph of your people, services and
            documents, notices when something looks wrong, and asks the right person. Every fact carries a confidence
            that fades as it ages, so SPINE can tell you when it is no longer sure. Answers come from that graph, with
            the facts they used shown beside them.
          </p>
          <p>Only a person&apos;s answer ever changes what SPINE believes; SPINE can notice and ask, but it never rewrites a fact itself.</p>
          <p className="text-[13px] text-white/65">All people, services and documents in this demo are invented.</p>
          <p className="text-[13px] text-white/65">Built with the help of AI coding assistants.</p>
        </div>
      </Group>
    </div>
  );
}
