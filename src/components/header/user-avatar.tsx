import { CircleUserRound } from "lucide-react";

interface Props {
  avatar: string | undefined;
  classes?: string;
}

export function UserAvatar({ classes = "", avatar }: Props) {
  return avatar ? (
    <img
      src={avatar}
      className={`rounded-full ${classes}`}
      height={24}
      width={24}
      alt=""
    />
  ) : (
    <CircleUserRound
      size={24}
      className={`text-primary disabled:text-muted-fg ${classes}`}
    />
  );
}
