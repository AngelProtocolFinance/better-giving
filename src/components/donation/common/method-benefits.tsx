import { ChevronDown, LightbulbIcon } from "lucide-react";
import { useState } from "react";

interface Props {
  classes?: string;
  subject: "stock" | "crypto" | "ira_qcd";
}

const content: Record<
  Props["subject"],
  {
    heading: string;
    teaser: string;
    expanded: string[];
    disclaimer?: string;
  }
> = {
  stock: {
    heading: "Benefits of donating appreciated stock",
    teaser:
      "Donate stock directly and you may avoid capital gains tax while maximizing your charitable impact.",
    expanded: [
      "If you have held the stock for more than one year, you may be eligible for a tax deduction based on its full fair market value at the time of donation.",
      "By donating appreciated stock directly to a nonprofit, you can avoid capital gains taxes that would apply if you sold it first — potentially making your gift up to 20% larger.",
    ],
    disclaimer:
      "This is general information, not tax advice. Please consult your tax advisor or broker regarding your specific situation.",
  },
  crypto: {
    heading: "Benefits of donating appreciated crypto",
    teaser:
      "You can enjoy significant tax advantages and maximize the size of your contributions when you transfer crypto.",
    expanded: [
      "If you held the crypto for at least one year, you receive a tax deduction for the full value of the crypto at the time of donation (not just the amount you paid for the crypto).",
      "You avoid paying both capital gains tax and crypto sales commissions. When you give appreciated crypto directly to a nonprofit, your gift can be up to 20% larger because you avoid the taxes you'd incur from selling and donating the cash.",
    ],
  },
  ira_qcd: {
    heading: "Benefits of an IRA Qualified Charitable Distribution",
    teaser:
      "Donate directly from your IRA through a Qualified Charitable Distribution (QCD), which may provide meaningful tax advantages if eligible.",
    expanded: [
      "If you are age 70½ or older, you can direct up to $105,000 per year from your IRA to qualified charities as a QCD. The distribution is excluded from your taxable income.",
      "A QCD can count toward your Required Minimum Distribution (RMD) for the year, reducing your overall taxable income while supporting the causes you care about.",
    ],
    disclaimer:
      "This is general information, not tax advice. Please consult your tax advisor or IRA provider regarding your specific situation.",
  },
};

export function MethodBenefits({ classes = "", subject }: Props) {
  const [expanded, set_expanded] = useState(false);
  const c = content[subject];
  return (
    <div className={`${classes} grid gap-y-2`}>
      <div className="flex items-center gap-x-1">
        <LightbulbIcon
          size={16}
          className="stroke-warning self-start h-lh shrink-0"
        />
        <h4 className="tex-sm font-medium">{c.heading}</h4>
      </div>
      <p className={`text-sm ${expanded ? "" : "mask-b-from-1 pb-2"}`}>
        {c.teaser}
      </p>
      {!expanded && (
        <button
          onClick={() => set_expanded(true)}
          type="button"
          className="flex items-center -mt-4 justify-self-start text-xs text-primary hover:underline"
        >
          read more <ChevronDown size={16} />
        </button>
      )}
      {expanded && c.disclaimer && (
        <div className="grid rounded bg-muted p-2">
          <span className="text-sm text-muted-fg">{c.disclaimer}</span>
        </div>
      )}
      {expanded &&
        c.expanded.map((text) => (
          <p key={text.slice(0, 30)} className="text-sm">
            {text}
          </p>
        ))}
    </div>
  );
}
