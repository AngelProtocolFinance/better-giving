interface IProps {
  data: number[];
  w?: number;
  h?: number;
  title?: string;
}

export function Spark({ data, w = 160, h = 64, title = "trend" }: IProps) {
  if (data.length < 2) return null;
  const pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((value, i): [number, number] => {
    const x = pad + i * step;
    const y = pad + (1 - (value - min) / (max - min || 1)) * (h - pad * 2);
    return [x, y];
  });
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${d} L${(pad + (data.length - 1) * step).toFixed(1)},${(h - pad).toFixed(1)} L${pad},${(h - pad).toFixed(1)} Z`;
  return (
    <svg width={w} height={h} className="block" role="img" aria-label={title}>
      <title>{title}</title>
      <path d={area} className="fill-muted" />
      <path
        d={d}
        fill="none"
        className="stroke-fg"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Bars({ data, w = 160, h = 64, title = "trend" }: IProps) {
  if (data.length === 0) return null;
  const pad = 4;
  const max = Math.max(...data, 1);
  const bw = (w - pad * 2) / data.length - 2;
  return (
    <svg width={w} height={h} className="block" role="img" aria-label={title}>
      <title>{title}</title>
      {data.map((value, i) => {
        const bh = (value / max) * (h - pad * 2);
        return (
          <rect
            key={`${i}-${value}`}
            x={pad + i * (bw + 2)}
            y={h - pad - bh}
            width={bw}
            height={bh}
            rx={1}
            className={i === data.length - 1 ? "fill-fg" : "fill-muted-fg/40"}
          />
        );
      })}
    </svg>
  );
}
