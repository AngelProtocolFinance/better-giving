import { Menu } from "@ark-ui/react/menu";
import { href, NavLink } from "react-router";
import type { INpoBookmark, IUserNpo2 } from "#/types/user";
import { Image } from "../../image";

interface IBookmarkLink extends INpoBookmark {}
export function BookmarkLink({ id, ...endow }: IBookmarkLink) {
  return (
    <_Link
      {...endow}
      id={id}
      to={href("/marketplace/:id", { id: id.toString() })}
    />
  );
}

export function EndowmentLink({ id, logo, name }: IUserNpo2) {
  return (
    <_Link
      id={id}
      logo={logo}
      name={name}
      to={href("/admin/:id", { id: id.toString() })}
    />
  );
}

type LinkProps = {
  id: number | string;
  name?: string;
  logo?: string;
  to: string;
};
const _Link = (props: LinkProps) => (
  <Menu.Item
    value={`endow-${props.id}`}
    asChild
    className="hover:text-primary text-sm grid grid-cols-subgrid col-span-2 items-center focus-visible:outline-none"
  >
    <NavLink to={props.to}>
      <Image
        loading="lazy"
        src={props.logo}
        className="object-cover aspect-square rounded-full"
        height={20}
        width={20}
      />
      <span className="">{props.name ?? `Endowment: ${props.id}`}</span>
    </NavLink>
  </Menu.Item>
);
