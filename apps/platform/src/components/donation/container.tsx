import type { DonationSource } from "#/types/lists";
import { donor_address_fv_init, donor_fv_blank } from "@/donations/schema";
import { Context } from "./context";
import { CurrentStep } from "./current-step";
import type {
  Config,
  DonationRecipient,
  Init,
  IProgram,
  IUser,
  Mode,
  TDonation,
} from "./types";

type Components = {
  source: DonationSource;
  mode: Mode;
  config: Config | null;
  recipient: DonationRecipient;
  user: IUser | undefined;
  program: IProgram | undefined;
  base_url: string;
};

type InitState = {
  init: TDonation;
};

type Props = {
  className?: string;
} & (Components | InitState);

export function Donation({ className = "", ...props }: Props) {
  const state = "init" in props ? props.init : init_state(props);

  const styles: Record<string, string | undefined> = {
    "--form-primary": state?.config?.accent_primary,
    "--form-secondary": state?.config?.accent_secondary,
  };

  return (
    <div
      id="donation-container"
      style={styles}
      className={`grid ${className} w-full @container/steps overflow-clip bg-background min-h-96`}
    >
      <Context {...("init" in props ? props.init : init_state(props))}>
        <CurrentStep />
      </Context>
    </div>
  );
}

function init_state({
  base_url,
  source,
  config,
  recipient,
  mode,
  user,
  program,
}: Components): TDonation {
  const init: Init = {
    base_url,
    source,
    config,
    recipient,
    mode,
    user,
    program,
  };

  const donor_init_prefilled = user
    ? {
        ...donor_fv_blank,
        first_name: user.first_name ?? "",
        last_name: user.last_name ?? "",
        email: user.email ?? "",
      }
    : donor_fv_blank;

  return {
    ...init,
    donor: recipient.donor_address_required
      ? //define with invalid address to force user to fill it out
        { ...donor_init_prefilled, address: donor_address_fv_init }
      : donor_init_prefilled,
    method: config?.method_ids?.[0] ?? "stripe",
  };
}
