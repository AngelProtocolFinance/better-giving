import { Menu } from "@ark-ui/react/menu";
import { href, NavLink } from "react-router";

interface Props {
  to: string | undefined;
  classes?: string;
}

export function AuthLinks({ to, classes = "" }: Props) {
  return (
    <Menu.ItemGroup
      className={`${classes} grid grid-cols-[2fr_3fr] p-1 gap-x-1`}
    >
      <Menu.Item value="login">
        <NavLink
          to={`${href("/login")}?redirect=${to}`}
          className="btn btn-secondary text-sm py-2 focus-visible:outline-none"
        >
          Log In
        </NavLink>
      </Menu.Item>

      <Menu.Item value="signup">
        <NavLink
          to={`${href("/signup")}?redirect=${to}`}
          className="btn btn-primary text-sm py-2 focus-visible:outline-none"
        >
          Join Us Today!
        </NavLink>
      </Menu.Item>
    </Menu.ItemGroup>
  );
}
