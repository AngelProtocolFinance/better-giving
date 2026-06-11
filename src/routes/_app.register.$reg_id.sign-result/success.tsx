import { ArrowDownToLine, CircleCheck } from "lucide-react";
import { href, Link, useNavigation, useRouteLoaderData } from "react-router";
import { next_step } from "#/pages/registration/routes";
import type { Reg$IdData } from "#/pages/registration/types";
import { Progress } from "@/reg/progress";
import type { SignerCompleteQueryParams } from "./types";

export default function Success({
  documentGroupEid,
}: SignerCompleteQueryParams) {
  const navigation = useNavigation();
  const { reg } = useRouteLoaderData(
    "routes/_app.register.$reg_id"
  ) as Reg$IdData;
  const step = new Progress(reg).step;

  const is_loading = navigation.state === "loading";

  return (
    <>
      <CircleCheck className="text-success" size={70} />
      <h1 className="text-2xl uppercase text-center mt-10 mb-4">
        Fiscal Sponsorship Agreement signature was successfully saved!
      </h1>

      <a
        download
        href={`/api/anvil-doc/${documentGroupEid}`}
        className="text-primary hover:text-primary active:text-primary mb-4 inline-block"
      >
        <ArrowDownToLine size={18} className="inline bottom-px relative mr-1" />
        <span className="text-sm font-semibold">Download</span>
      </a>
      <Link
        aria-disabled={is_loading}
        className="w-full max-w-[26.25rem] btn btn-primary text-sm mt-4"
        to={`${href("/register/:reg_id", {
          reg_id: reg.id,
        })}/${next_step[step]}`}
      >
        {is_loading ? "Loading..." : "Continue"}
      </Link>
    </>
  );
}
