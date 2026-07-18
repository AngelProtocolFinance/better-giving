import { format } from "date-fns";
import { href, Link } from "react-router";
import type { Referred } from "#/types/referrals";
import { humanize } from "@/helpers/decimal";
import { Info } from "../status";

interface Props {
  classes?: string;
  npos: Referred[];
}

export function Nonprofits({ classes = "", npos }: Props) {
  const rows = npos.map((npo) => {
    const now = new Date();
    const expiry = new Date(npo.up_until);

    return (
      <tr key={npo.id}>
        <td className="text-sm">
          <Link
            to={href("/marketplace/:id", { id: npo.id.toString() })}
            className="text-primary hover:text-primary"
          >
            {npo.name}
          </Link>
        </td>
        <td className="text-sm">${humanize(npo.ltd)}</td>
        <td
          className={`text-sm ${now > expiry ? "text-destructive" : "text-success"}`}
        >
          {now > expiry ? "Ended" : `ends in ${format(expiry, "PP")}`}
        </td>
      </tr>
    );
  });
  return (
    <div className={classes}>
      <h2 className="text-2xl mb-4">Onboarded Nonprofits</h2>
      {rows.length > 0 ? (
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border bg-card rounded">
          <table className="min-w-full [&_th,&_td]:p-2 [&_th,&_td]:first:pl-0 [&_th,&_td]:text-left [&_tbody]:divide-y [&_tbody]:divide-border divide-y divide-border">
            <thead>
              <tr>
                <th>Name</th>
                <th>Earnings</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </div>
      ) : (
        <Info>No nonprofits onboarded yet</Info>
      )}
    </div>
  );
}
