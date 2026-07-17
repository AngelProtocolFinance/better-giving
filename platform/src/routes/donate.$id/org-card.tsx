import { href, Link } from "react-router";
import type { DonateData } from "#/api/donate-loader";
import { Image } from "#/components/image";
import { to_text } from "#/components/rich-text";
import { Target, type TTarget, to_target } from "#/components/target";

interface Props extends Pick<DonateData, "program"> {
  id: number;
  name: string;
  logo: string;
  tagline?: string;
  target?: TTarget;
  contributions_total?: number;
  classes?: string;
}
export function OrgCard({ classes = "", program, ...props }: Props) {
  return (
    <div
      className={`grid @xl/org-card:grid-cols-[3fr_2fr] gap-x-4 gap-y-6 p-4 md:bg-card rounded md:border ${classes}`}
    >
      <div className="grid grid-cols-[auto-1fr] gap-x-4 justify-start order-2 @xl/org-card:order-1">
        <Image
          src={props.logo}
          width={56}
          height={56}
          className="size-14 border rounded object-cover bg-card row-span-2"
        />
        <Link
          to={href("/marketplace/:id", { id: props.id.toString() })}
          className="hover:text-primary text-ellipsis overflow-hidden text-nowrap @xl/org-card:text-balance col-start-2 w-full"
        >
          <span>{props.name}</span>
          {program ? (
            <>
              {" "}
              - <span>{program.title}</span>
            </>
          ) : null}
        </Link>
        {props.tagline && !program && (
          <p className="text-muted-fg text-sm w-full line-clamp-2">
            {props.tagline}
          </p>
        )}
        {program && (
          <p className="text-muted-fg text-sm w-full line-clamp-2">
            {props.tagline || to_text(program.description_pt)}
          </p>
        )}
      </div>

      {props.target && (
        <Target
          text={<Target.Text classes="mb-2" />}
          progress={props.contributions_total ?? 0}
          target={to_target(props.target)}
          classes="order-1 @xl/org-card:order-2"
        />
      )}
    </div>
  );
}
