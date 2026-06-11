interface IEmphasis {
  children: React.ReactNode;
}

export function Emphasis({ children }: IEmphasis) {
  return <span className="font-medium tracking-tight">{children}</span>;
}
