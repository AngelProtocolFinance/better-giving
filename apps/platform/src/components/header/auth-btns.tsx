import { href, Link } from "react-router";
import { login_url } from "#/helpers/login-url";

interface Props {
  classes?: string;
  to: string;
}
export function AuthBtns({ classes = "", to }: Props) {
  return (
    <div className={`${classes} flex items-center gap-x-4`}>
      <Link to={login_url(to)} className="btn btn-secondary text-nowrap">
        Log In
      </Link>
      <Link
        to={`${href("/signup")}?redirect=${encodeURIComponent(to)}`}
        className="btn btn-primary text-nowrap"
      >
        Join Us Today!
      </Link>
    </div>
  );
}
