import { Menu } from "@base-ui/react/menu";
import { LogOutIcon, ShieldIcon } from "lucide-react";
import { Form, href, Link, useNavigation } from "react-router";
import type { PublicUser } from "#/types/auth";
import { UserAvatar } from "../user-avatar";
import { Bookmarks } from "./bookmarks";
import { Organizations } from "./organizations";

type Props = {
  classes?: string;
  user: PublicUser;
};
export function UserMenu({ user, classes }: Props) {
  const navigation = useNavigation();
  return (
    <Menu.Group
      className={`${classes} bg-gradient-to-br from-popover to-secondary text-popover-fg grid grid-cols-[auto_1fr] auto-rows-min grid-rows-[auto_1fr] content-start gap-x-2 p-4`}
    >
      <Menu.Item
        render={<Link to={href("/dashboard/donations")} />}
        className="mb-6 hover:text-primary text-sm whitespace-nowrap grid grid-cols-subgrid col-span-2 items-center"
      >
        <UserAvatar avatar={user.avatar_url} classes="w-5" />
        <span>My Dashboard</span>
      </Menu.Item>

      <Organizations user={user} classes="hidden [&:has(a)]:grid mb-4" />
      <Bookmarks user={user} classes="hidden [&:has(a)]:grid mb-4" />
      {user.is_admin && (
        <Menu.Item
          render={<Link to={href("/platform")} />}
          className="hover:text-primary text-sm grid content-start grid-cols-subgrid col-span-2 items-center mt-2"
        >
          <ShieldIcon size={18} />
          <span>Platform Admin</span>
        </Menu.Item>
      )}
      <Form className="contents" method="POST" action={href("/logout")}>
        <button
          disabled={navigation.state !== "idle"}
          type="submit"
          className="mt-4 self-end text-xs font-black grid grid-cols-subgrid col-span-2 text-primary disabled:text-muted-fg"
        >
          <LogOutIcon size={16} />
          <span className="col-start-2 text-left">Log Out</span>
        </button>
      </Form>
    </Menu.Group>
  );
}
