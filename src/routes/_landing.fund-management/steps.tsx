import { Split } from "lucide-react";
import { motion } from "motion/react";
import { href, Link } from "react-router";

interface IStep {
  num: number;
  label: string;
  title: string;
  body: React.ReactNode;
}

const steps: IStep[] = [
  {
    num: 1,
    label: "Step one",
    title: "Register & onboard",
    body: (
      <>
        Click{" "}
        <Link
          to={href("/register/welcome")}
          className="underline hover:text-primary"
        >
          register
        </Link>{" "}
        and complete a quick onboarding process that only takes a few minutes.
      </>
    ),
  },
  {
    num: 2,
    label: "Step two",
    title: "Deposit & collect",
    body: (
      <>
        Deposit funds through our interface and/or easily create your own
        branded donation form to embed on your site.
      </>
    ),
  },
  {
    num: 3,
    label: "Step three",
    title: "Monitor & move funds",
    body: (
      <>
        Check the status of your fund performance, transfer between
        savings/investments, or withdraw at any time — no lockups.
      </>
    ),
  },
];

export function Steps({ classes = "" }) {
  return (
    <section className={`${classes}`} aria-labelledby="fm-steps-heading">
      <h2
        id="fm-steps-heading"
        className="font-bold text-3xl/tight md:text-4_5xl/tight tracking-tight text-center"
      >
        Get Started in Three Simple Steps
      </h2>

      <ol className="grid md:grid-cols-3 gap-6 mt-14">
        {steps.map((step, idx) => (
          <motion.li
            key={step.num}
            className="border border-border rounded-md bg-card p-7 flex flex-col gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ type: "spring", delay: idx * 0.1 }}
          >
            <div className="inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-muted-fg">
              <span className="size-7 rounded-md bg-primary text-primary-fg inline-flex items-center justify-center text-sm font-bold normal-case tracking-normal">
                {step.num}
              </span>
              {step.label}
            </div>
            <h3 className="text-lg font-bold tracking-tight">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-fg">{step.body}</p>
          </motion.li>
        ))}
      </ol>

      <div className="mt-10 p-6 bg-muted border border-border rounded-md flex items-center gap-5">
        <span className="size-10 rounded-md bg-background border border-border inline-flex items-center justify-center shrink-0">
          <Split size={18} strokeWidth={2} />
        </span>
        <p className="text-[15px] leading-relaxed">
          Fund your account yourself or use our free donation processing form.
          Donations can be automatically split how you prefer between savings,
          investments, and direct grants to your bank account.
        </p>
      </div>
    </section>
  );
}
