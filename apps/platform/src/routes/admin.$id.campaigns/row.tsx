import {
  Badge,
  type BadgeTone,
  ImagePlaceholder,
  Target,
} from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import type { ReactNode } from "react";
import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";
import type { STATUS_WORD } from "./copy";

export type TRowStatus =
  | (typeof STATUS_WORD)[keyof typeof STATUS_WORD]
  | "Closed"
  | "Profile";

const STATUS_TONE: Record<TRowStatus, BadgeTone> = {
  Live: "success",
  Draft: "neutral",
  Ended: "secondary",
  Closed: "destructive",
  Profile: "primary",
};

const NO_END_MS = Date.parse(MAX_EXPIRATION_ISO);

export function when(iso: string | null) {
  if (!iso) return "No end date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** fund search docs store expiration as unix seconds; the year-9999 sentinel is no end date */
export function fund_end(expiration: number) {
  if (expiration * 1000 >= NO_END_MS) return "No end date";
  return when(new Date(expiration * 1000).toISOString());
}

/** a smart or absent target has no fixed goal to measure against */
function fixed_goal(target: IRow["target"]): number | null {
  const n = Number(target);
  return target && n > 0 ? n : null;
}

export interface IRow {
  name: string;
  /** for a control elsewhere in the row that names itself by the row */
  name_id?: string;
  status: TRowStatus;
  thumb: string | null;
  raised: number;
  /** the stored target: a number string, "smart", or absent */
  target: string | null | undefined;
  byline?: ReactNode;
  /** absent for the profile, which never ends */
  ends?: string;
  actions?: ReactNode;
}

export function Row({
  name,
  name_id,
  status,
  thumb,
  raised,
  target,
  byline,
  ends,
  actions,
}: IRow) {
  const goal = fixed_goal(target);
  return (
    <li className="card grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center gap-4">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="size-16 rounded object-cover self-start"
        />
      ) : (
        <ImagePlaceholder classes="size-16 rounded self-start" />
      )}
      <div className="grid gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p id={name_id} className="font-semibold">
            {name}
          </p>
          <Badge tone={STATUS_TONE[status]}>{status}</Badge>
        </div>
        {byline}
        {goal ? (
          <Target classes="max-w-sm" progress={raised} target={goal} />
        ) : (
          <span className="text-sm text-gray-11">{to_usd(raised)} raised</span>
        )}
        {ends && <span className="text-sm text-gray-11">{ends}</span>}
      </div>
      {actions && (
        <div className="col-span-full sm:col-span-1 flex flex-wrap items-center gap-3 sm:justify-end">
          {actions}
        </div>
      )}
    </li>
  );
}
