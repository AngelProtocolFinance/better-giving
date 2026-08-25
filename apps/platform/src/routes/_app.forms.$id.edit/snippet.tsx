import { Copier } from "@better-giving/ui";

type Props = {
  classes?: string;
  form_id: string;
  base_url: string;
};
export function Snippet({ classes = "", form_id, base_url }: Props) {
  /** allow payment https://docs.stripe.com/payments/payment-methods/pmd-registration?dashboard-or-api=dashboard#using-an-iframe */
  const iframe_url = `<iframe src="${base_url}/forms/${form_id}" allow="payment" width="700" height="900" style="border:0px"></iframe>`;

  return (
    <div className={`${classes} relative`}>
      <p className="text-sm gap-x-1 mb-1">
        Copy snippet below and paste into your website
      </p>
      <div className="flex p-4 rounded bg-gray-3 divide-x divide-gray-6">
        <code className="w-full text-sm font-mono break-all block pr-2 whitespace-pre-line">
          {iframe_url}
        </code>
        <Copier
          classes={{
            icon: "size-5 hover:text-primary",
            container: "ml-2",
          }}
          text={iframe_url}
        />
      </div>
    </div>
  );
}
