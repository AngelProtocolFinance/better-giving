import { href, Link } from "react-router";

interface Props {
  classes?: string;
  to: string;
}
export function AuthBtns({ classes = "", to }: Props) {
  return (
    <div className={`${classes} flex items-center gap-x-4`}>
      <Link
        to={`${href("/login")}?redirect=${encodeURIComponent(to)}`}
        className="btn btn-secondary text-nowrap rounded"
      >
        Log In
      </Link>
      <Link
        to={`${href("/signup")}?redirect=${encodeURIComponent(to)}`}
        className="btn btn-primary text-nowrap rounded"
      >
        Join Us Today!
      </Link>
    </div>
  );
}
