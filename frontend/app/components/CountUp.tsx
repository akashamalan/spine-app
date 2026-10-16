"use client";
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/** A number that counts from its last value to the new one when it changes. */
export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    const controls = animate(start, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <span className="tabular-nums">{shown}</span>;
}
