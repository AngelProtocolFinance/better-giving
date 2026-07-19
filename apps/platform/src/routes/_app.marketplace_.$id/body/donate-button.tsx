import { href, NavLink } from "react-router";

interface Props {
  id: number;
  classes?: string;
}

export function DonateButton({ classes = "", id }: Props) {
  return (
    <NavLink
      to={href("/donate/:id", { id: id.toString() })}
      className={`${classes} btn btn-primary h-12 px-6 lg:text-sm`}
    >
      Donate now
    </NavLink>
  );
}
