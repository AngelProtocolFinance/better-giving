const stats = [
  { value: "180+", label: "nonprofits worldwide" },
  { value: "$6M+", label: "raised for partners" },
  { value: "$0", label: "platform or fund fees" },
  { value: "2021", label: "serving nonprofits since" },
] as const;

interface ITrustBar {
  classes?: string;
}

export function TrustBar({ classes = "" }: ITrustBar) {
  return (
    <div className={`${classes} border-y border-border px-6 py-7`}>
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-y-6">
        {stats.map((s, i) => (
          <div
            key={s.value}
            className={`grid gap-0.5 content-start ${i > 0 ? "md:border-l md:border-border md:pl-9" : ""} ${i % 2 === 1 ? "max-md:border-l max-md:border-border max-md:pl-6" : ""}`}
          >
            <span className="text-2xl md:text-3xl font-bold">{s.value}</span>
            <span className="text-sm text-muted-fg">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
