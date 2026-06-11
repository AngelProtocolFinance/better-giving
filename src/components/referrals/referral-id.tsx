import { href } from "react-router";
import { Copier } from "../copier";

interface Props {
  classes?: string;
  referral_id: string;
  base_url: string;
}

export function ReferralId({ classes = "", ...p }: Props) {
  return (
    <div className={`bg-muted p-6 rounded border ${classes}`}>
      <div className="mb-4">
        <div className="text-sm font-medium text-muted-fg mb-1">
          REFERRAL ID
        </div>
        <div className="flex items-center">
          <div className="text-xl font-semibold mr-2">{p.referral_id}</div>
          <Copier
            text={p.referral_id}
            classes={{
              container: "text-muted-fg hover:text-fg",
              icon: "size-5",
            }}
            size={20}
          />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-muted-fg mb-1">
          REFERRAL LINK
        </div>
        <div className="flex items-center">
          <p className="text-primary truncate max-w-xs font-mono">
            {p.base_url}
            {href("/register/welcome")}?referrer={p.referral_id}
          </p>
          <Copier
            text={`${p.base_url}${href("/register/welcome")}?referrer=${p.referral_id}`}
            classes={{
              container: "text-muted-fg hover:text-fg ml-2",
              icon: "size-5",
            }}
            size={20}
          />
        </div>
      </div>
    </div>
  );
}
