import { EMAILS } from "@better-giving/brand";

const promises = [
  {
    n: "1",
    title: "Your records export",
    body: "Donation records export from your dashboard.",
  },
  {
    n: "2",
    title: "Card credentials stay here",
    body: "We do not transfer stored card credentials to another payment processor. No outbound migration exists today.",
  },
  {
    n: "3",
    title: "No migration timeline",
    body: "Leaving is not a product fee. We do not promise a day count for moving recurring gifts.",
  },
  {
    n: "4",
    title: "The code is public",
    body: "Anyone can read how donations are processed. The product you join is the managed platform.",
  },
] as const;

interface IPortability {
  classes?: string;
}

export function Portability({ classes = "" }: IPortability) {
  return (
    <section className={classes} aria-labelledby="portability-heading">
      <div className="page">
        <p className="text-xs font-bold uppercase tracking-wider text-primary text-center">
          No lock-in
        </p>
        <h2
          id="portability-heading"
          className="section-heading text-center mt-3 max-w-3xl mx-auto"
        >
          Your donor records are yours
        </h2>
        <p className="mt-3.5 text-gray-11 text-center max-w-2xl mx-auto text-pretty">
          You can export donation records from the dashboard. We do not move
          stored card credentials to another processor, and we do not run an
          outbound migration.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-11">
          {promises.map((p) => (
            <div key={p.n} className="bg-secondary rounded px-7 py-6">
              <span className="block text-3xl font-bold text-primary">
                {p.n}
              </span>
              <span className="block font-bold mt-2 mb-1.5">{p.title}</span>
              <span className="text-sm/normal text-gray-11">{p.body}</span>
            </div>
          ))}
        </div>
        <p className="mt-7 text-sm/relaxed text-gray-11 text-center max-w-3xl mx-auto text-pretty">
          A donor who wants to keep giving after you leave authorizes a new gift
          with the new provider. Questions:{" "}
          <a href={`mailto:${EMAILS.support}`} className="font-bold link">
            {EMAILS.support}
          </a>
        </p>
      </div>
    </section>
  );
}
