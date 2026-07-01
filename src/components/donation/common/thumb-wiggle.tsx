import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";

interface Props {
  play: boolean;
  children: ReactNode;
  // fired when the hop burst ends, so the caller can close the nudge window
  on_done?: () => void;
}

// partway toward on (~8px of the ~14px travel) and back, three hops
const HOP = { x: [0, 8, 0, 8, 0, 8, 0] };
const HOP_TRANSITION = {
  duration: 1.4,
  ease: "easeInOut" as const,
  times: [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84],
};

// wraps the switch thumb and hops it toward the "on" position and back a few
// times — an affordance nudge that shows both where the toggle is and what to
// do with it. the hop is an extra transform layered on top of the thumb's own
// translate, so it composes cleanly with the real on/off states. set-once play
// means the keyframes run a single burst, then rest.
export function ThumbWiggle({ play, children, on_done }: Props) {
  const reduce = useReducedMotion();

  // no hop to complete for reduced-motion users; close the window right away
  useEffect(() => {
    if (play && reduce) on_done?.();
  }, [play, reduce, on_done]);

  if (reduce || !play) return <>{children}</>;

  return (
    <motion.span
      className="inline-flex"
      animate={HOP}
      transition={HOP_TRANSITION}
      onAnimationComplete={on_done}
    >
      {children}
    </motion.span>
  );
}
