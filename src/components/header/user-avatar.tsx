import { Avatar } from "@ark-ui/react/avatar";
import { CircleUserRound } from "lucide-react";

interface Props {
  avatar: string | undefined;
  classes?: string;
}

export function UserAvatar({ classes = "", avatar }: Props) {
  return (
    <Avatar.Root className={`inline-flex size-6 rounded-full ${classes}`}>
      <Avatar.Fallback>
        <CircleUserRound
          size={24}
          className="text-primary disabled:text-muted-fg"
        />
      </Avatar.Fallback>
      <Avatar.Image
        src={avatar}
        alt=""
        className="size-full rounded-full object-cover"
      />
    </Avatar.Root>
  );
}
