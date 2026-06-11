import { Check, Layers, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

interface IPillar {
  icon: React.ReactNode;
  title: string;
  items: string[];
}

const pillars: IPillar[] = [
  {
    icon: <Layers size={18} strokeWidth={2} />,
    title: "Style Diversification",
    items: [
      "Value equities provide resilience across market cycles",
      "Core equities deliver broad market exposure",
      "Growth equities support long-term capital appreciation",
    ],
  },
  {
    icon: <ShieldCheck size={18} strokeWidth={2} />,
    title: "Structural Risk Management",
    items: [
      "Diversification across U.S. and international markets",
      "Meaningful allocation to high-quality fixed income",
      "Quarterly rebalancing to maintain discipline",
    ],
  },
];

export function BalancedStrategy({ classes = "" }) {
  return (
    <section
      className={`${classes}`}
      aria-labelledby="balanced-strategy-heading"
    >
      <div className="max-w-3xl">
        <h2
          id="balanced-strategy-heading"
          className="font-bold text-3xl/tight md:text-4_5xl/tight tracking-tight"
        >
          Balanced, Diversified Investment Strategy
        </h2>
        <p className="mt-3 text-muted-fg text-lg">
          Designed to Reduce Volatility While Preserving Long-Term Growth
        </p>
        <p className="mt-5 text-base leading-relaxed max-w-2xl">
          The Better Giving Managed Investment Fund is structured to balance
          complementary equity styles and diversified asset classes, rather than
          relying on a single growth engine.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-14">
        {pillars.map((p, idx) => (
          <motion.article
            key={p.title}
            className="border border-border rounded-md p-7 bg-card flex flex-col gap-5"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ type: "spring", delay: idx * 0.1 }}
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-md bg-primary text-primary-fg inline-flex items-center justify-center">
                {p.icon}
              </span>
              <h3 className="text-lg font-bold tracking-tight">{p.title}</h3>
            </div>
            <ul className="flex flex-col gap-3.5">
              {p.items.map((item) => (
                <li
                  key={item}
                  className="grid grid-cols-[20px_1fr] gap-3 items-start text-[15px] leading-relaxed"
                >
                  <span className="size-5 rounded-full bg-muted text-fg inline-flex items-center justify-center mt-0.5">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.article>
        ))}
      </div>

      <p className="mt-10 pl-6 border-l-2 border-border italic text-muted-fg text-[15px] leading-relaxed max-w-3xl">
        This approach prioritizes capital stewardship and stability, consistent
        with nonprofit governance and reserve management needs.
      </p>
    </section>
  );
}
