import { Avatar } from "@ark-ui/react/avatar";
import { CircleUserRound } from "lucide-react";

interface Props {
  avatar: string | undefined;
  classes?: string;
}

export function UserAvatar({ classes = "", avatar }: Props) {
  return (
    <Avatar.Root
      className={`inline-flex shrink-0 rounded-full overflow-hidden size-7 ${classes}`}
    >
      <Avatar.Fallback>
        <CircleUserRound className="size-full text-primary disabled:text-muted-fg" />
      </Avatar.Fallback>
      <Avatar.Image
        src={avatar}
        alt=""
        className="size-full rounded-full object-cover"
      />
    </Avatar.Root>
  );
}
