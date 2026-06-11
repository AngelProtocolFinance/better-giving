import { Menu } from "@base-ui/react/menu";
import { href, NavLink } from "react-router";

interface Props {
  to: string | undefined;
  classes?: string;
}

export function AuthLinks({ to, classes = "" }: Props) {
  return (
    <Menu.Group className={`${classes} grid grid-cols-[2fr_3fr] p-1 gap-x-1`}>
      <Menu.Item>
        <NavLink
          to={`${href("/login")}?redirect=${to}`}
          className="btn btn-secondary text-sm py-2"
        >
          Log In
        </NavLink>
      </Menu.Item>

      <Menu.Item>
        <NavLink
          to={`${href("/signup")}?redirect=${to}`}
          className="btn btn-primary text-sm py-2"
        >
          Join Us Today!
        </NavLink>
      </Menu.Item>
    </Menu.Group>
  );
}
