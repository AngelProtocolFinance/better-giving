import { Collapsible } from "@base-ui/react/collapsible";
import {
  BrainIcon,
  CheckIcon,
  LightbulbIcon as LightBulbIcon,
  LinkIcon,
  MessageCircleQuestionIcon as QuestionMarkCircleIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { href, Link } from "react-router";
import { app_name } from "#/constants/env";
import { referrals_hub } from "#/constants/urls";
import { ExtLink } from "../ext-link";
import { DrawerIcon } from "../icon";

export function Explainer({ classes = "" }) {
  const [open, set_open] = useState(false);

  useEffect(() => {
    const sync = () => set_open(window.innerWidth >= 768);

    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return (
    <div className={`w-full ${classes}`}>
      <Collapsible.Root open={open} onOpenChange={set_open}>
        <div className="flex items-center gap-x-1 mb-1 relative">
          <LightBulbIcon
            className="max-md:hidden text-primary shrink-0 absolute -left-6"
            size={19}
          />
          <h3 className="text-lg">About the {app_name} Referral Program</h3>
        </div>
        <p>
          You can earn rewards by helping nonprofits discover {app_name}. When a
          nonprofit signs up using your referral link or code, you'll earn 30%
          of the contributions made by donors to support {app_name} — for the
          next 3 years.
        </p>
        <Collapsible.Panel
          keepMounted
          className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0"
        >
          <div className="flex items-start gap-3 mt-4 max-w-4xl relative">
            <BrainIcon
              size={18}
              className="max-md:hidden text-primary absolute -left-6 top-1"
            />
            <div>
              <p>
                {app_name} doesn't charge fees — instead, donors can choose to
                support our platform directly during checkout. These donor
                contributions average around 5% of each donation.
              </p>
              <p className="mt-2">
                So if a nonprofit receives $100,000 in online donations, donors
                typically contribute about $5,000 to {app_name} — and you'd earn
                $1,500 from that.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 max-w-4xl">
            <div className="flex items-start gap-2">
              <CheckIcon
                size={18}
                className="text-success flex-shrink-0 mt-0.5"
              />
              <p>
                Open to all {app_name} users — including donors, nonprofit
                staff, consultants, and fundraising pros
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckIcon
                size={18}
                className="text-success flex-shrink-0 mt-0.5"
              />
              <p>Share your unique referral link or code</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckIcon
                size={18}
                className="text-success flex-shrink-0 mt-0.5"
              />
              <p>Track your referrals and payouts in this dashboard</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <Link
              target="_blank"
              to={href("/terms-of-use-referrals")}
              className="inline-flex items-center text-primary text-sm hover:text-primary font-medium"
            >
              <LinkIcon className="size-4 mr-1" />
              View Full Program Terms
            </Link>
            <ExtLink
              href={referrals_hub}
              className="inline-flex items-center text-primary text-sm hover:text-primary font-medium"
            >
              <QuestionMarkCircleIcon className="size-4 mr-1" />
              Referral FAQ
            </ExtLink>
          </div>
        </Collapsible.Panel>

        <Collapsible.Trigger
          className={`flex items-center justify-center text-primary ${open ? "mt-4" : "mt-2"}`}
        >
          <span className="text-sm font-medium mr-1">
            {open ? "Show less" : "Read more"}
          </span>
          <DrawerIcon is_open={open} size={18} />
        </Collapsible.Trigger>
      </Collapsible.Root>
    </div>
  );
}
