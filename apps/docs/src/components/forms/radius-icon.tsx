import type { RadiusPreset } from "./radius-presets";

export function RadiusIcon({ preset }: { preset: RadiusPreset }) {
  const radius = {
    none: 0,
    sm: 3,
    lg: 6,
    full: 10,
  }[preset];

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={`M2 18 L2 ${2 + radius} Q2 2 ${2 + radius} 2 L18 2`}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
