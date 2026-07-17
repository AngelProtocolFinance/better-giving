import { href, Link } from "react-router";
import { Confirmed, Info } from "#/components/status";

interface Props {
  published: boolean;
  fundId: string;
  classes?: string;
  onToggle: () => void;
  isToggling: boolean;
}

export function PublishBanner({ classes = "", ...props }: Props) {
  return (
    <div
      className={`${classes} flex flex-wrap justify-between items-center border rounded p-4 gap-4 ${
        props.published
          ? "bg-success/10 border-success"
          : "bg-warning/10 border-warning"
      }`}
    >
      {props.published ? (
        <Confirmed>Your fund is visible in the funds page</Confirmed>
      ) : (
        <Info classes="text-warning">
          Your endowment is not visible in the funds page
        </Info>
      )}
      <div className="flex items-center gap-x-2">
        <button
          disabled={props.isToggling}
          onClick={props.onToggle}
          type="button"
          className="text-xs btn btn-primary px-4 py-2 rounded"
        >
          {props.isToggling
            ? "Updating.."
            : props.published
              ? "Unpublish"
              : "Publish"}
        </button>
        <Link
          target="_blank"
          to={href("/fundraisers/:fund_id", { fund_id: props.fundId })}
          className="text-primary hover:text-fg text-sm flex items-center gap-1"
        >
          View
        </Link>
      </div>
    </div>
  );
}
