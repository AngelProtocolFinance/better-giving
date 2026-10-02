import { flat_colors } from "@better-giving/brand/flat";
import { Text } from "react-email";
import { Link } from "../components/link";
import { MailTo } from "../components/mail-to";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, EMAILS } from "../constants";
import { format_amount } from "../helpers";
import type { IAmount } from "../types";

export type TInterval = "day" | "week" | "month" | "year";

/** the donor asked to cancel and was shown it as cancelled; the processor refused, and ops cancels it by hand */
export interface IData {
  to_name: string;
  amount: IAmount;
  interval: TInterval;
  interval_count: number;
  /** absolute, from the sending environment */
  subscriptions_url: string;
}

const ADJECTIVE: Record<TInterval, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  year: "yearly",
};

const describe_gift = ({ amount, interval, interval_count }: IData) =>
  interval_count > 1
    ? `recurring donation of ${format_amount(amount)} every ${interval_count} ${interval}s`
    : `${ADJECTIVE[interval]} donation of ${format_amount(amount)}`;

function Jsx(d: IData) {
  return (
    <PublicLayout type="donation">
      <Text>Hi there,</Text>
      <Text>
        We weren't able to cancel your {describe_gift(d)} to {d.to_name}. Our
        payment processor didn't accept the cancellation, so the donation is
        still active. Our team has been told and will stop it for you.
      </Text>
      <Text>
        You can see it on your{" "}
        <Link href={d.subscriptions_url}>subscriptions page</Link>. If you have
        any questions, contact our support team at{" "}
        <MailTo email={EMAILS.support} />.
      </Text>
      <Text>We're sorry for the trouble.</Text>
      <Text style={{ margin: 0 }}>Warm regards,</Text>
      <Text
        style={{
          margin: 0,
          marginBottom: 20,
          fontWeight: 600,
          color: flat_colors.primary,
        }}
      >
        The {APP_NAME} Team
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => ({
  node: <Jsx {...data} />,
  subject: `Your donation to ${data.to_name} was not cancelled`,
});
