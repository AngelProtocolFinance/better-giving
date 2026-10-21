import {
  Actions,
  type AskProps,
  Modal,
  Target,
  to_target,
  use_ask,
} from "@better-giving/ui";
import { fromUnixTime } from "date-fns";
import { LoaderCircle } from "lucide-react";
import { useId, useRef } from "react";
import {
  href,
  Link,
  NavLink,
  useFetcher,
  useLocation,
  useParams,
} from "react-router";
import {
  FundCreator,
  FundStatusBadge,
  status_fn,
} from "#/components/fundraiser";
import type { IFundItem } from "@/fundraiser";
import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";

interface Props extends IFundItem {
  isSelf: boolean;
  isEditor: boolean;
}
export const FundItem = (props: Props) => {
  const fetcher = useFetcher({ key: `fund-${props.id}` });
  const { pathname } = useLocation();
  const { id: npo_id } = useParams();
  // leave stays on the funds action; this card also renders under /campaigns
  const leave_action =
    npo_id && pathname.includes("/campaigns")
      ? href("/admin/:id/funds", { id: npo_id })
      : undefined;
  const ask = use_ask();
  const name_id = useId();
  const leave_label_id = useId();
  // the list query sends the max-expiration sentinel for a fund with no end date
  const has_end = props.expiration * 1000 < Date.parse(MAX_EXPIRATION_ISO);
  const status = status_fn(
    has_end ? fromUnixTime(props.expiration).toISOString() : undefined,
    props.active,
    props.donation_total_usd
  );
  const busy = fetcher.state !== "idle";
  const leave = () => {
    void ask(LeaveConfirm, {
      name: props.name,
      creator_name: props.creator_name,
      on_leave: () => {
        fetcher.submit(
          { fund_id: props.id },
          leave_action
            ? { method: "POST", action: leave_action }
            : { method: "POST" }
        );
      },
    });
  };

  return (
    <div className="card grid grid-rows-subgrid row-span-6 content-start gap-y-0 items-center">
      <div className="flex items-start justify-between">
        <img
          src={props.logo}
          width={50}
          className="object-cover aspect-square rounded-full"
          alt=""
        />
        <FundStatusBadge status={status} />
      </div>

      <p id={name_id} className="mt-4 font-semibold">
        {props.name}
      </p>
      <div className="mb-2">
        <span className="text-sm mr-1">by</span>
        <FundCreator
          name={props.creator_name}
          id={props.creator_id}
          classes="text-sm inline"
        />
      </div>

      <Target
        classes="mt-4"
        progress={props.donation_total_usd}
        target={to_target(props.target)}
      />

      <div className="actions-split mt-6">
        {/** fund item won't show once NPO opted out of it: so no need to hide this button */}
        {!props.isSelf ? (
          // held, not `disabled`, while the leave is in flight: `disabled`
          // would drop the dialog's return focus onto `<body>`
          <button
            type="button"
            className={`btn btn-destructive gap-2${busy ? " pending" : ""}`}
            disabled={!props.active}
            aria-disabled={busy || undefined}
            aria-busy={busy}
            aria-labelledby={`${leave_label_id} ${name_id}`}
            onClick={() => {
              if (busy) return;
              leave();
            }}
          >
            {busy && <LoaderCircle className="animate-spin icon-xs" />}
            <span id={leave_label_id}>
              {busy ? "Leaving…" : "Leave fundraiser"}
            </span>
          </button>
        ) : (
          // holds the left slot open so `Edit` stays at the right edge; when
          // the row stacks there is no slot to hold, only a phantom gap
          <div data-placeholder className="max-sm:hidden" />
        )}
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {props.published && (
            <Link
              to={href("/fundraisers/:fund_id", { fund_id: props.id })}
              target="_blank"
              rel="noopener noreferrer"
              className="link text-sm"
            >
              View
            </Link>
          )}
          {props.isEditor && (
            <NavLink
              aria-disabled={!status.active}
              className="btn btn-secondary"
              to={href("/fundraisers/:fund_id/edit", { fund_id: props.id })}
            >
              Edit
            </NavLink>
          )}
        </div>
      </div>
    </div>
  );
};

interface ILeaveConfirm {
  name: string;
  creator_name: string;
  on_leave: () => void;
}

/** asked, never mounted directly. */
function LeaveConfirm({
  name,
  creator_name,
  on_leave,
  open,
  resolve,
  on_closed,
}: ILeaveConfirm & AskProps) {
  const cancel_ref = useRef<HTMLButtonElement>(null);
  // the card's in-flight lock arrives on the next render, so a second
  // press here would post twice
  const sent = useRef(false);
  return (
    <Modal
      open={open}
      onClose={() => resolve()}
      onExitComplete={on_closed}
      initialFocusEl={() => cancel_ref.current}
      returnFocusFallback={() => {
        const heading = document.querySelector("h1");
        return heading instanceof HTMLElement ? heading : null;
      }}
      classes="bg-panel text-gray-12"
    >
      <div className="p-6 sm:p-8 grid gap-2">
        <h3 className="text-lg font-bold">Leave {name}?</h3>
        <p className="text-sm text-gray-11">
          An email goes to {creator_name}. You will stop receiving from this
          fundraiser.
        </p>
      </div>
      <Actions band>
        <button
          ref={cancel_ref}
          type="button"
          className="btn btn-secondary"
          onClick={() => resolve()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-destructive"
          onClick={() => {
            if (sent.current) return;
            sent.current = true;
            on_leave();
            resolve();
          }}
        >
          Leave fundraiser
        </button>
      </Actions>
    </Modal>
  );
}
