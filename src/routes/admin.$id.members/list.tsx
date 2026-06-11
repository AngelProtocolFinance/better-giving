import { Plus } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import type { LoaderData } from "./api";
import { DeleteForm } from "./delete-form";

interface IList extends LoaderData {}
export function List(props: IList) {
  return (
    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
      <NavLink
        className="justify-self-end btn btn-primary px-4 py-1.5 text-sm gap-2 mb-2"
        to="add"
      >
        <Plus size={16} />
        <span>Invite user</span>
      </NavLink>
      <Loaded {...props} />
      {/** render add form */}
      <Outlet />
    </div>
  );
}

interface LoadedProps extends LoaderData {
  classes?: string;
}
function Loaded({ admins, classes = "", user }: LoadedProps) {
  return (
    <table className={`${classes} table`}>
      <thead>
        <tr>
          <th className="w-8" />
          <th>Email</th>
          <th>First Name</th>
          <th>Last Name</th>
        </tr>
      </thead>
      <tbody>
        {admins.map((member) => (
          <tr key={member.email} className="text-sm">
            <td>
              <DeleteForm
                user={user.id}
                to_remove={member.id}
                pending_email={member.pending ? member.email : undefined}
                label={member.email}
              />
            </td>
            <td>
              {member.email}
              {member.pending && (
                <span className="ml-2 text-xs text-warning">• Pending</span>
              )}
            </td>
            <td>{member.first_name ?? "-"}</td>
            <td>{member.last_name ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
