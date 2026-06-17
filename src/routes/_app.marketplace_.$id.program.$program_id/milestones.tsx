import { Image } from "#/components/image";
import { RichText } from "#/components/rich-text";
import { Info } from "#/components/status";
import { Container } from "#/pages/marketplace/container";
import type { IMilestone } from "@/npo";

type Props = {
  classes?: string;
  milestones: IMilestone[];
};

export function Milestones({ classes = "", milestones }: Props) {
  return (
    <Container
      title="Milestones"
      classes={`${classes} w-full lg:w-[29.75rem]`}
      expanded
    >
      {milestones.length > 0 ? (
        <div className="m-6 sm:m-8">
          {milestones.map((m, idx) => (
            <Milestone {...m} key={idx} />
          ))}
        </div>
      ) : (
        <Info classes="m-6">No milestones found</Info>
      )}
    </Container>
  );
}

function Milestone(m: IMilestone) {
  const isComplete = new Date() >= new Date(m.date);

  return (
    <div
      className={`pb-4 pt-4 first:pt-0 last:pb-0 border-l ${
        isComplete ? "border-primary" : ""
      }`}
    >
      {m.media && (
        <div className="pl-6 sm:pl-8">
          <Image src={m.media} className="h-60 w-full rounded" />
        </div>
      )}

      <p className="mt-4 pl-6 sm:pl-8 mb-3 text-muted-fg text-xs">
        {new Date(m.date).toLocaleDateString()}
      </p>
      <h6 className="pl-6 sm:pl-8 font-bold mb-3 relative">
        {m.title}
        <span className="bg-card w-4 h-6 absolute left-[-0.5px] top-1/2 -translate-y-1/2 -translate-x-1/2" />
        <span
          className={`${
            isComplete ? "bg-primary" : "bg-muted"
          } w-4 h-4 rounded-full absolute left-[-0.5px] top-1/2 -translate-y-1/2 -translate-x-1/2`}
        />
      </h6>
      <div className="pl-6 sm:pl-8">
        <RichText
          content={{ value: m.description_pt }}
          readOnly
          classes={{
            field: "text-muted-fg text-sm w-full",
          }}
        />
      </div>
    </div>
  );
}
