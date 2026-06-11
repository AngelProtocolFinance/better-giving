import type { LucideProps } from "lucide-react";
import { Bitcoin, Heart, Palette } from "lucide-react";
import { motion } from "motion/react";
import type { ComponentType } from "react";

interface IScenario {
  icon: ComponentType<LucideProps>;
  title: string;
  body: string;
}

const scenarios: IScenario[] = [
  {
    icon: Heart,
    title: "The Food Bank",
    body: "What if a New York-based expat could support their local food bank in Manchester in a tax-efficient way?",
  },
  {
    icon: Bitcoin,
    title: "The Wildlife Trust",
    body: "What if a Silicon Valley coder could donate Bitcoin to your Scottish Highlands project?",
  },
  {
    icon: Palette,
    title: "The Arts Hub",
    body: "What if a US foundation could bridge the gap left by local government cuts?",
  },
];

export function Scenarios() {
  return (
    <section className="bg-card py-20 md:py-24">
      <div className="xl:container xl:mx-auto px-5 md:px-10">
        <motion.div
          className="text-center mb-14 grid gap-4"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="section-heading font-bold">What If?</h2>
          <p className="section-body text-muted-fg max-w-2xl mx-auto">
            Imagine the possibilities when geography no longer limits
            generosity.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {scenarios.map((scenario, i) => (
            <motion.div
              key={scenario.title}
              className="bg-card border border-border rounded-lg p-6 grid content-start gap-3"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div className="size-12 rounded-lg bg-primary/10 flex-center text-primary">
                <scenario.icon size={24} />
              </div>
              <h3 className="text-xl font-bold">{scenario.title}</h3>
              <p className="text-muted-fg">{scenario.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
