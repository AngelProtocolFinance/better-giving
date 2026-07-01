import {
  type MotionValue,
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type RefObject, useRef } from "react";

interface Props {
  // one full loop, ms
  duration?: number;
  classes?: string;
}

// dots forming the comet tail; dense enough that overlapping dots + slight blur
// read as one continuous gradient line (brightest at the front, fading back)
const TRAIL = 41;
// fraction of the full loop the tail spans
const TAIL_SPAN = 0.54;
// constant lean thickness of the tail line, px
const TAIL_W = 1.5;

// a soft comet tail of light that travels the border of its parent. the parent
// must be `position: relative` and sized to the shape being traced (wrap padded
// elements so inset-0 lands on the visible edge); an invisible svg rect supplies
// the path and getPointAtLength drives the dots around it, each lagging further
// behind to form the tail. adapted from aceternity ui's moving-border.
export function CometBorder({ duration = 3000, classes = "" }: Props) {
  const path_ref = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);
  const reduce = useReducedMotion();

  useAnimationFrame((t) => {
    if (reduce) return;
    const len = path_ref.current?.getTotalLength();
    if (!len) return;
    progress.set((t * (len / duration)) % len);
  });

  // hooks above run unconditionally; bail on render for reduced-motion users
  if (reduce) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${classes}`}
    >
      <svg
        aria-hidden="true"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        {/* ry only → rx inherits ry, giving a stadium (pill) not an ellipse */}
        <rect ref={path_ref} fill="none" width="100%" height="100%" ry="50%" />
      </svg>
      {Array.from({ length: TRAIL }, (_, i) => (
        <Dot
          key={`comet-${i}`}
          progress={progress}
          path_ref={path_ref}
          index={i}
        />
      ))}
    </div>
  );
}

interface DotProps {
  progress: MotionValue<number>;
  path_ref: RefObject<SVGRectElement | null>;
  index: number;
}

function Dot({ progress, path_ref, index }: DotProps) {
  const f = index / (TRAIL - 1); // 0 front .. 1 tail end
  const lag = f * TAIL_SPAN; // fraction of loop this dot trails the front

  const x = useTransform(progress, (p) => {
    const len = path_ref.current?.getTotalLength() ?? 0;
    if (!len) return 0;
    return (
      path_ref.current?.getPointAtLength((p - lag * len + len) % len).x ?? 0
    );
  });
  const y = useTransform(progress, (p) => {
    const len = path_ref.current?.getTotalLength() ?? 0;
    if (!len) return 0;
    return (
      path_ref.current?.getPointAtLength((p - lag * len + len) % len).y ?? 0
    );
  });
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  const opacity = (1 - f) ** 1.1; // brightest at the front, fade toward the end

  return (
    <motion.div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: TAIL_W,
        height: TAIL_W,
        opacity,
        borderRadius: "9999px",
        background:
          "radial-gradient(var(--color-primary) 55%, transparent 80%)",
        filter: "blur(0.6px)", // fuse adjacent dots into one gradient line
        transform,
      }}
    />
  );
}
