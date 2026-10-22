import { Image } from "@better-giving/ui";
import { RichText } from "#/components/rich-text";
import type { IMilestone } from "@/npo";

interface IMilestones {
  milestones: IMilestone[];
  classes?: string;
}

const date_fmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** a timeline, oldest first; a reached milestone fills its dot and line */
export function Milestones({ milestones, classes = "" }: IMilestones) {
  if (milestones.length === 0) return null;
  const now = Date.now();
  return (
    <section className={`flex flex-col gap-5 ${classes}`}>
      <h2 className="text-2xl font-bold">Milestones</h2>
      <ol className="flex flex-col">
        {milestones.map((m, idx) => {
          const reached = new Date(m.date).getTime() <= now;
          const last = idx === milestones.length - 1;
          return (
            <li
              key={`${m.date}-${idx}`}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-4"
            >
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className={`mt-1 size-4 shrink-0 rounded-full border-2 ${
                    reached
                      ? "border-primary bg-primary"
                      : "border-gray-8 bg-panel"
                  }`}
                />
                {!last && (
                  <span
                    aria-hidden
                    className={`w-0.5 flex-1 ${reached ? "bg-primary" : "bg-gray-6"}`}
                  />
                )}
              </div>
              <div className={`flex flex-col gap-2 ${last ? "" : "pb-8"}`}>
                <p className="text-sm font-semibold text-gray-11">
                  {date_fmt.format(new Date(m.date))}
                </p>
                <h3 className="text-lg font-bold">{m.title}</h3>
                <RichText
                  readOnly
                  content={{ value: m.description_pt }}
                  classes={{ field: "w-full text-gray-11" }}
                />
                {m.media && (
                  <Image
                    src={m.media}
                    alt=""
                    className="aspect-2/1 w-full max-w-lg rounded object-cover"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
