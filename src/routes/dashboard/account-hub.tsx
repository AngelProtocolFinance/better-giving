import { LogOutIcon, PlusIcon, ShieldIcon } from "lucide-react";
import { Form, href, Link, useNavigation } from "react-router";
import { UserAvatar } from "#/components/header/user-avatar";
import { Image } from "#/components/image";
import { use_user } from "#/hooks/use-user";

export function AccountHub() {
  const { user } = use_user();
  const navigation = useNavigation();

  if (user === "loading") {
    return (
      <div className="p-5 border-b">
        <div className="size-10 rounded-full bg-secondary motion-safe:animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="grid gap-y-5 p-5 border-b text-sm">
      {/* user card */}
      <Link
        to={href("/dashboard/donations")}
        className="flex items-center gap-x-3 hover:text-primary"
      >
        <UserAvatar avatar={user.avatar_url} classes="size-10" />
        <span className="font-bold">My Account</span>
      </Link>

      {/* organizations */}
      <div className="grid gap-y-1">
        <h5 className="uppercase text-xs text-muted-fg mb-1">
          My Organizations
        </h5>
        {user.orgs.map((org) => (
          <Link
            key={org.id}
            to={href("/admin/:id", { id: org.id.toString() })}
            className="flex items-center gap-x-2 hover:text-primary"
          >
            <Image
              loading="lazy"
              src={org.logo}
              className="object-cover aspect-square rounded-full shrink-0"
              height={20}
              width={20}
            />
            <span>{org.name}</span>
          </Link>
        ))}
        <Link
          to={href("/register")}
          className="flex items-center gap-x-2 hover:text-primary"
        >
          <PlusIcon size={20} className="shrink-0" />
          <span>Register an organization</span>
        </Link>
      </div>

      {/* bookmarks — hidden when empty */}
      <div className="hidden has-[a]:grid gap-y-1">
        <h5 className="uppercase text-xs text-muted-fg mb-1">My Favorites</h5>
        {user.bookmarks.map((b) => (
          <Link
            key={b.id}
            to={href("/marketplace/:id", { id: b.id.toString() })}
            className="flex items-center gap-x-2 hover:text-primary"
          >
            <Image
              loading="lazy"
              src={b.logo}
              className="object-cover aspect-square rounded-full shrink-0"
              height={20}
              width={20}
            />
            <span>{b.name}</span>
          </Link>
        ))}
      </div>

      {user.is_admin && (
        <Link
          to={href("/platform")}
          className="flex items-center gap-x-2 hover:text-primary"
        >
          <ShieldIcon size={18} className="shrink-0" />
          <span>Platform Admin</span>
        </Link>
      )}

      <Form method="POST" action={href("/logout")}>
        <button
          disabled={navigation.state !== "idle"}
          type="submit"
          className="flex items-center gap-x-2 hover:text-primary disabled:text-muted-fg"
        >
          <LogOutIcon size={16} className="shrink-0" />
          <span>Log Out</span>
        </button>
      </Form>
    </div>
  );
}
