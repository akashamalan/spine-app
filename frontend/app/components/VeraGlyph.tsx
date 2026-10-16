"use client";

export function VeraGlyph({
  state,
  probeCount,
  onClick,
}: {
  state: "dormant" | "waking" | "speaking" | "settled";
  probeCount: number;
  onClick: () => void;
}) {
  const stateClass =
    state === "dormant"
      ? "vera-dormant"
      : state === "waking"
        ? "vera-waking"
        : state === "speaking"
          ? "vera-speaking"
          : "";

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
        state === "speaking"
          ? "border-primary bg-accent-soft"
          : "border-rule bg-slab hover:bg-sunk"
      } ${stateClass}`}
      title={
        probeCount > 0
          ? `Vera has ${probeCount} question${probeCount !== 1 ? "s" : ""} for humans`
          : "Vera is quiet"
      }
    >
      {/* Vera icon — a stylized "V" with a pulse ring */}
      <div className="relative">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          className={state === "speaking" ? "text-primary" : "text-ink-faint"}
        >
          {/* Outer ring */}
          <circle
            cx="9"
            cy="9"
            r="8"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            opacity={state === "dormant" ? 0.3 : 0.6}
          />
          {/* V shape */}
          <path
            d="M5 5L9 13L13 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Ping dot when there are probes */}
        {probeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-signal animate-pulse" />
        )}
      </div>

      <span
        className={`text-xs font-medium ${
          state === "speaking" ? "text-primary" : "text-ink-faint"
        }`}
      >
        Vera
      </span>

      {/* Probe count badge — top-right of the button */}
      {probeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-signal text-white text-[10px] font-bold leading-none">
          {probeCount}
        </span>
      )}
    </button>
  );
}
