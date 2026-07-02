import laira1 from "#/assets/laira/laira1.webp";
import laira2 from "#/assets/laira/laira2.webp";
import laira3 from "#/assets/laira/laira3.webp";
import { Image } from "#/components/image";

const steps = [
  {
    img: laira1,
    alt: "Laira holding the number 1",
    step: "Step 1",
    title: "Sign up",
    body: "Register free in minutes. No fees, no contracts — you're a Member from day one.",
  },
  {
    img: laira2,
    alt: "Laira holding the number 2",
    step: "Step 2",
    title: "Add the donation form",
    body: "Brand it and embed it on your site. Fewer clicks and express checkout mean more completed gifts and monthly donors.",
  },
  {
    img: laira3,
    alt: "Laira holding the number 3",
    step: "Step 3",
    title: "Grow",
    body: "Get payouts within 5 working days — or route a share into savings and the Sustainability Fund.",
  },
] as const;

interface ISteps {
  classes?: string;
}

export function Steps({ classes = "" }: ISteps) {
  return (
    <section className={classes} aria-labelledby="steps-heading">
      <div className="max-w-6xl mx-auto">
        <h2 id="steps-heading" className="section-heading text-center">
          Easy as 1-2-3
        </h2>
        <div className="grid gap-8 md:grid-cols-3 mt-13">
          {steps.map((s) => (
            <div
              key={s.step}
              className="grid gap-3 justify-items-center text-center content-start"
            >
              <Image src={s.img} className="h-35 w-auto" alt={s.alt} />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                {s.step}
              </span>
              <span className="text-2xl font-bold">{s.title}</span>
              <p className="text-sm/relaxed text-muted-fg max-w-72">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
