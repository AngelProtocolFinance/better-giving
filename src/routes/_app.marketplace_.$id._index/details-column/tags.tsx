import { Fingerprint } from "lucide-react";
import type { PropsWithChildren } from "react";
import { unsdgs } from "#/constants/unsdgs";
import type { EndowDesignation, UnSdgNum } from "@/npo";
import { EndowDesignationTag } from "./endow-designation-tag";

interface Props {
  designation: EndowDesignation;
  kyc_donors_only: boolean;
  sdgs: UnSdgNum[];
}

export function Tags(props: Props) {
  return (
    <div className="flex flex-col items-start gap-3">
      {<EndowDesignationTag endow_designation={props.designation} />}
      {props.kyc_donors_only && (
        <Tag>
          <Fingerprint size={20} /> Donor Verification required
        </Tag>
      )}
      {props.sdgs.map((unsdg_num) => (
        <Tag key={unsdg_num}>
          SDG #{unsdg_num} : {unsdgs[unsdg_num].title}
        </Tag>
      ))}
    </div>
  );
}

const Tag = (props: PropsWithChildren) => (
  <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-full font-semibold text-sm">
    {props.children}
  </div>
);
