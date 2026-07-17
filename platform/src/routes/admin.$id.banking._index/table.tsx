import { FolderIcon } from "lucide-react";
import { NavLink } from "react-router";
import type { IBapp, TStatus } from "@/banking";
import { toPP } from "@/helpers/date";

type Props = {
  methods: IBapp[];
  classes?: string;
};

export function Table({ methods, classes = "" }: Props) {
  return (
    <table className={`${classes} table`}>
      <thead>
        <tr>
          <th>Date Submitted</th>
          <th>Account</th>
          <th className="text-center">Status</th>
          <th className="text-center">Details</th>
        </tr>
      </thead>
      <tbody>
        {methods.map((row) => (
          <tr key={row.id} className="text-sm">
            <td>{toPP(row.date_created)}</td>
            <td>{row.bank_summary}</td>
            <td className="text-center">
              <Status status={row.status} />
            </td>
            <td>
              <NavLink
                to={row.id}
                className="[.pending]:text-muted-fg text-center w-full inline-block hover:text-primary"
              >
                <FolderIcon
                  size={22}
                  aria-label="bank statement file"
                  className="inline-block"
                />
              </NavLink>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const style: { [key in TStatus]: string } = {
  default: "bg-primary text-primary-fg",
  approved: "bg-success text-success-fg",
  "under-review": "bg-muted-fg text-primary-fg",
  rejected: "bg-destructive text-destructive-fg",
};

const text: { [key in TStatus]: string } = {
  default: "Default",
  "under-review": "Under review",
  rejected: "Rejected",
  approved: "Approved",
};

function Status({ status }: { status: TStatus }) {
  return (
    <p
      className={`${style[status]} rounded px-3 py-1 inline-block uppercase text-xs`}
    >
      {text[status]}
    </p>
  );
}
