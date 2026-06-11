import { href, Link } from "react-router";

interface Props {
  classes?: string;
  to: string;
}
export function AuthBtns({ classes = "", to }: Props) {
  return (
    <div className={`${classes} flex items-center gap-x-4`}>
      <Link
        to={`${href("/login")}?redirect=${to}`}
        className="font-semibold aria-disabled:text-muted-fg hover:underline"
      >
        Log In
      </Link>
      <Link
        to={`${href("/signup")}?redirect=${to}`}
        className="btn-primary font-semibold text-nowrap px-6 py-2 rounded"
      >
        Join Us Today!
      </Link>
    </div>
  );
}
