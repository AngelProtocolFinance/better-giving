import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { href, Link, useParams } from "react-router";
import flying_character from "#/assets/images/flying-character.webp";
import { Image } from "#/components/image";
import { use_user } from "#/hooks/use-user";

interface IEndow {
  name: string;
  logo?: string | null;
}

export function Loader({ name, logo = flying_character }: IEndow) {
  const { user } = use_user();
  const { id: current_id } = useParams();

  const orgs = user && user !== "loading" ? user.orgs : [];
  // trigger always reflects the SSR-loaded current org; fall back to it as the
  // sole entry until /api/me resolves the full org list client-side
  const list = orgs.length
    ? orgs
    : [{ id: Number(current_id), name, logo: logo || undefined }];

  return (
    <Menu.Root positioning={{ placement: "bottom", gutter: 4 }}>
      <Menu.Trigger className="group flex items-center gap-2 w-full py-4 px-5 border-b text-left focus-visible:outline-2 focus-visible:outline-ring">
        <Image className="size-14 shrink-0" src={logo || flying_character} />
        <h5 className="text-sm font-bold truncate flex-1">{name}</h5>
        <ChevronsUpDownIcon
          size={16}
          className="shrink-0 text-muted-fg group-hover:text-fg"
        />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="z-40 grid w-max min-w-56 p-2 rounded bg-popover text-popover-fg shadow-xl shadow-black/5 origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out">
            {list.map((org) => {
              const is_current = org.id.toString() === current_id;
              return (
                <Menu.Item
                  key={org.id}
                  value={org.id.toString()}
                  asChild
                  className="focus-visible:outline-none"
                >
                  <Link
                    to={href("/admin/:id", { id: org.id.toString() })}
                    className="hover:bg-muted data-highlighted:bg-muted data-highlighted:text-fg flex items-center gap-2 px-2 py-2 rounded text-muted-fg hover:text-fg"
                  >
                    <Image
                      src={org.logo || flying_character}
                      className="size-6 shrink-0 rounded-full object-cover aspect-square"
                    />
                    <span className="text-sm truncate flex-1">{org.name}</span>
                    {is_current && (
                      <CheckIcon size={16} className="shrink-0 text-primary" />
                    )}
                  </Link>
                </Menu.Item>
              );
            })}
            <Menu.Item
              value="register"
              asChild
              className="focus-visible:outline-none"
            >
              <Link
                to={href("/register")}
                className="hover:bg-muted data-highlighted:bg-muted data-highlighted:text-fg border-t mt-1 flex items-center gap-2 px-2 py-2 rounded text-muted-fg hover:text-fg"
              >
                <PlusIcon size={16} className="shrink-0" />
                <span className="text-sm">Register another org</span>
              </Link>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
