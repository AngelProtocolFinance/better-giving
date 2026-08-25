/* a categorical legend, deliberately OFF the design palette. bitcoin's orange,
   ethereum's blue-violet, gold's gold and silver's silver are the assets' own
   colors and repointing them at ramp steps would name the wrong thing; the rest
   are arbitrary and only have to stay apart from each other and from those four.
   read the whole map like the decorative --color-* washes, not like semantic
   tokens. the fallback below is the exception — a gray carries no identity, so
   it comes off the ramp. */
export const ticker_colors: { [ticker: string]: string } = {
  BTC: "#f7931a",
  ETH: "#627eea",
  IEFA: "#8b5cf6",
  QQQ: "#06b6d4",
  BNDX: "#6b7280",
  CASH: "#22c55e",
  FLOT: "#3b82f6",
  FNDF: "#f59e0b",
  IVV: "#dc2626",
  QQQM: "#14b8a6",
  BSV: "#a855f7",
  BND: "#ef4444",
  SIVR: "#c0c0c0",
  GLDM: "#ffd700",
  VTV: "#10b981",
};

/* every unmapped ticker, wherever one is drawn or labelled. gray-9: the ramp's
   neutral solid, so an unknown symbol reads as unkeyed rather than as a hue. */
export const unmapped_ticker_color = "#868f9a";
