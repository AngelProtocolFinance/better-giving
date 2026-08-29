import { Image } from "@better-giving/ui";
import { href, Link } from "react-router";
import { BOOK_A_DEMO } from "#/constants/urls";
import type { PageContext } from "./types";

interface Props extends PageContext {
  classes?: string;
}

export function Cta({ classes = "", ...props }: Props) {
  return (
    <div
      className={`relative bg-linear-to-br from-primary to-secondary w-full p-8 rounded ${classes}`}
    >
      <h4 className="text-center  section-heading text-primary-fg mb-6">
        {props.cta.pre} Grow Together.
      </h4>
      <h3 className="text-center section-body text-balance text-primary-fg mb-9">
        {props.cta.body} — membership in the Better Giving Alliance starts free,
        and grows with you.
      </h3>
      <div className="flex flex-col @xl:flex-row justify-center items-center gap-6 mt-10">
        <Link
          to={href("/register")}
          className="text-center btn xl:btn-lg btn-primary font-bold"
        >
          Start Today - Free
        </Link>
        <Link
          to={BOOK_A_DEMO}
          className="capitalize text-center btn xl:btn-lg btn-secondary font-bold"
        >
          Questions? Chat with us
        </Link>
      </div>
      <Image
        src={props.left}
        width={110}
        className="max-md:hidden absolute right-0 md:-right-6 -bottom-12"
      />
      <Image
        src={props.right}
        width={110}
        className="max-md:hidden absolute left-0 md:-left-6 -bottom-12"
      />
    </div>
  );
}
