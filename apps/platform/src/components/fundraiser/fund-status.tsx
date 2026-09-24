import { Badge, type BadgeTone } from "@better-giving/ui";
import { unpack } from "@better-giving/ui/helpers";
import { formatDistance } from "date-fns";
import { fund_is_open } from "@/fundraiser/is-open";
import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";

interface IStatus {
  active: boolean;
  text?: "closed" | "completed" | "expired" | (string & {});
}

export const status = (
  expiry: string | undefined,
  active: boolean,
  progress: number
): IStatus => {
  if (!active) return { active: false, text: "closed" };

  if (!expiry || expiry === MAX_EXPIRATION_ISO) return { active: true };

  const now = new Date();
  if (!fund_is_open({ active, expiration: expiry }, now))
    return {
      active: false,
      text: progress ? "completed" : "expired",
    };

  return {
    active: true,
    text: `ends in ${formatDistance(new Date(expiry), now)}`,
  };
};

interface IFundStatus {
  classes?: {
    container?: string;
    inactive?: string;
    expired?: string;
    completed?: string;
    active?: string;
  };
  status: IStatus;
}

export const FundStatus = (props: IFundStatus) => {
  const s = unpack(props.classes);
  if (!props.status.text) return null;
  const style = ((t) => {
    switch (t) {
      case "closed":
        return s.inactive;
      case "completed":
        return s.completed;
      case "expired":
        return s.expired;
      default:
        return s.active;
    }
  })(props.status.text);

  return <div className={`${s.container} ${style}`}>{props.status.text}</div>;
};

/** the status as a pill, for a fund card */
export const FundStatusBadge = ({ status }: { status: IStatus }) => {
  if (!status.text) return null;
  const tone = ((t): BadgeTone => {
    switch (t) {
      case "closed":
        return "destructive";
      case "completed":
        return "success";
      case "expired":
        return "neutral";
      default:
        return "secondary";
    }
  })(status.text);
  return <Badge tone={tone}>{status.text}</Badge>;
};
