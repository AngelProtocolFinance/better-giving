import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";

// mimics nprogress trickle: diminishing increments as progress grows
function trickle(v: number): number {
  if (v < 20) return v + 3;
  if (v < 50) return v + 2;
  if (v < 80) return v + 0.5;
  if (v < 95) return v + 0.1;
  return v;
}

type Phase = "idle" | "loading" | "completing";

export function NavProgress() {
  const { state } = useNavigation();
  const [phase, set_phase] = useState<Phase>("idle");
  const [width, set_width] = useState(0);
  const interval_ref = useRef<ReturnType<typeof setInterval>>(undefined);
  const phase_ref = useRef(phase);
  phase_ref.current = phase;

  useEffect(() => {
    if (state !== "idle") {
      set_width(5);
      set_phase("loading");
      interval_ref.current = setInterval(
        () => set_width((w) => trickle(w)),
        300
      );
    } else if (phase_ref.current === "loading") {
      // nav finished — snap to 100% then fade
      clearInterval(interval_ref.current);
      set_width(100);
      set_phase("completing");
      const t = setTimeout(() => {
        set_phase("idle");
        set_width(0);
      }, 400);
      return () => clearTimeout(t);
    }
    return () => clearInterval(interval_ref.current);
  }, [state]);

  if (phase === "idle") return null;

  return (
    <div
      className="fixed top-0 left-0 h-0.5 bg-primary z-99"
      style={{
        width: `${width}%`,
        opacity: phase === "completing" ? 0 : 1,
        transition:
          phase === "completing"
            ? "width 0.15s ease-out, opacity 0.3s 0.1s ease-in"
            : "width 0.3s ease-out",
      }}
    />
  );
}
