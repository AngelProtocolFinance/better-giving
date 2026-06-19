import { Tabs } from "@ark-ui/react/tabs";
import {
  Building2,
  ChartSpline,
  Coins,
  CreditCard,
  Landmark,
} from "lucide-react";
import type React from "react";
import type { ReactNode } from "react";
import dafPayLogo from "#/assets/icons/dafpay.svg";
import type { DonateMethodId } from "@/npo";
import { Label } from "../../form";
import { Image } from "../../image";
import { all_method_ids } from "../common/constants";
import type { TDonation, TMethodState } from "../types";
import { Form as Crypto } from "./crypto";
import { Form as Daf } from "./daf";
import { Form as IraQcd } from "./ira-qcd";
import { Form as Stocks } from "./stocks";
import { Form as Stripe } from "./stripe";
import { Form as StripeBank } from "./stripe-bank";

const methods: {
  [K in DonateMethodId]: {
    name: string;
    icon: ReactNode;
    panel: (props: TMethodState<K>) => React.JSX.Element;
  };
} = {
  stripe: {
    name: "Card",
    icon: <CreditCard className="shrink-0" size={18} />,
    panel: Stripe,
  },
  stripe_bank: {
    name: "Bank Transfer",
    icon: <Landmark className="shrink-0" size={18} />,
    panel: StripeBank,
  },
  stocks: {
    name: "Stocks",
    icon: <ChartSpline className="shrink-0" size={18} />,
    panel: Stocks,
  },
  daf: {
    name: "Donor Advised Fund",
    icon: <Image src={dafPayLogo} className="shrink-0 h-4" />,
    panel: Daf,
  },
  ira_qcd: {
    name: "IRA / QCD",
    icon: <Building2 className="shrink-0" size={18} />,
    panel: IraQcd,
  },
  crypto: {
    name: "Crypto",
    icon: <Coins className="shrink-0" size={22} />,
    panel: Crypto,
  },
};

const tab_classes =
  "outline outline-secondary @xl/steps:outline-none text-muted-fg data-[selected]:bg-(--form-secondary) data-[selected]:text-fg data-[selected]:outline-none flex items-center gap-2 p-2 @xl/steps:px-3 @xl/steps:py-[1.15rem] @xl/steps:grid @xl/steps:grid-cols-subgrid @xl/steps:col-span-2 focus:outline-hidden @xl/steps:w-full rounded @xl/steps:rounded-none";

export function DonateMethods(props: TDonation) {
  const { config, method, ...fvs } = props;
  const { method_ids: tabs = all_method_ids } = config || {};
  const tab_idx_found = tabs.indexOf(method);

  if (tabs.length === 1) {
    const Panel = methods[method].panel;
    const s: TMethodState<typeof method> = fvs[method] || {
      type: method,
      step: "form",
    };
    return (
      <div className="grid p-4 @xl/steps:p-8">
        <Panel {...(s as any)} />
      </div>
    );
  }

  return (
    <Tabs.Root
      data-testid="donate-methods"
      className="grid @xl/steps:grid-cols-[auto_1fr]"
      defaultValue={tabs[tab_idx_found === -1 ? 0 : tab_idx_found]}
      lazyMount
      unmountOnExit
    >
      <Label className="p-4 pb-0 col-span-full @xl/steps:hidden font-bold">
        Payment method
      </Label>
      <Tabs.List className="grid @md/steps:grid-cols-2 gap-2 @xl/steps:gap-0 p-4 @xl/steps:p-0 @xl/steps:grid-cols-[auto_1fr] @[42rem]/steps:min-w-48 content-start @xl/steps:divide-y @xl/steps:divide-white @xl/steps:border-r">
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab} value={tab} className={tab_classes}>
            {methods[tab].icon}
            <span className="text-left text-sm">
              {methods[tab].name}
              {tab === "stripe_bank" && (
                <span className="block text-2xs leading-none font-medium text-primary">
                  Lowest fee
                </span>
              )}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className="grid p-4 @xl/steps:p-8 pt-0 @xl/steps:pt-4">
        {tabs.map((tab) => {
          const Panel = methods[tab].panel;
          const s: TMethodState<typeof tab> = fvs[tab] || {
            type: tab,
            step: "form",
          };
          return (
            <Tabs.Content key={tab} value={tab}>
              <Panel {...(s as any)} />
            </Tabs.Content>
          );
        })}
      </div>
    </Tabs.Root>
  );
}
