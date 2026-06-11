import type { PublicUser } from "#/types/auth";
import { EndowmentLink } from "./endowment-link";

interface Props {
  user: PublicUser;
  classes?: string;
}
export function Organizations({ user, classes = "" }: Props) {
  return (
    <div
      className={`${classes} content-start grid-cols-subgrid col-span-2 gap-y-1`}
    >
      <h5 className="uppercase text-xs text-muted-fg col-span-2 mb-1">
        My Organizations
      </h5>
      {user.orgs.map((org) => (
        <EndowmentLink key={org.id} {...org} />
      ))}
    </div>
  );
}
