export const RADIUS_PRESETS = {
  none: 0,
  sm: 6,
  lg: 12,
  full: 9999,
} as const;

export type RadiusPreset = keyof typeof RADIUS_PRESETS;
