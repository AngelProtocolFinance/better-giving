import { LoaderCircle, Minus } from "lucide-react";
import { useFetcher } from "react-router";
import { show_toast } from "#/components/toaster";

interface Props {
  user: string;
  // user id for existing member, null for pending non-user invite
  to_remove: string | null;
  // for pending rows, the invitee email used to delete the invite row
  pending_email?: string;
  label: string;
}

export function DeleteForm({ user, to_remove, pending_email, label }: Props) {
  const key = to_remove ?? pending_email ?? label;
  const fetcher = useFetcher({ key: `admin-${key}` });

  return (
    <fetcher.Form method="POST" className="relative">
      <button
        disabled={fetcher.state !== "idle"}
        onClick={() => {
          if (to_remove && to_remove === user) {
            return show_toast({ type: "error", message: "Can't delete self" });
          }
          if (!window.confirm(`Are you sure you want to remove ${label}?`))
            return;
          const body: Record<string, string> = pending_email
            ? { pending_email }
            : { to_remove: to_remove ?? "" };
          fetcher.submit(body, {
            action: ".",
            method: "POST",
            encType: "application/json",
          });
        }}
        type="button"
        className=" disabled:text-muted-fg hover:text-destructive active:text-destructive absolute-center"
      >
        {fetcher.state !== "idle" ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : (
          <Minus size={16} />
        )}
      </button>
    </fetcher.Form>
  );
}
