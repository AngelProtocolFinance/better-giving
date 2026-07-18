import { Link, Text } from "react-email";
import { MailTo } from "../components/mail-to";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL, EMAILS } from "../constants";

type Action = "rejected" | "approved" | "default" | "new";

export interface IData {
  action: Action;
  account_summary: string;
  rejection_reason?: string;
}

const descriptions: Record<Action, string> = {
  rejected: "rejected",
  approved: "approved",
  default: "set to default",
  new: "submitted for review",
};

const subjects: Record<Action, string> = {
  new: `${APP_NAME}: new banking details`,
  approved: `${APP_NAME}: Your banking application has been approved`,
  rejected: `${APP_NAME}: Your banking application update`,
  default: `${APP_NAME}: Banking application received`,
};

function Jsx({ action, account_summary, rejection_reason }: IData) {
  return (
    <PublicLayout
      bottom_content={
        <Text style={{ textAlign: "center", fontSize: 12, color: "gray" }}>
          Getting too many emails?{" "}
          <Link href={`${DAPP_URL}/dashboard/settings`}>
            Manage your preferences
          </Link>
        </Text>
      }
    >
      <Text>Hi,</Text>
      <Text style={{ marginBottom: 4 }}>
        Thank you for submitting your bank details.
      </Text>
      <Text style={{ marginTop: 4 }}>
        UPDATE: {account_summary} has been {descriptions[action]}.
      </Text>

      {action === "rejected" && rejection_reason && (
        <Text style={{ color: "red" }}>Reason: {rejection_reason}</Text>
      )}
      {action !== "default" && (
        <Text style={{ marginTop: 4 }}>
          We shall be in touch regarding any further action you may need to
          take, but if you have any questions about this update, please email{" "}
          <MailTo email={EMAILS.hi} />
        </Text>
      )}
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: subjects[data.action],
  };
};
