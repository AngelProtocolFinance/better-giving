import { Link, Text } from "react-email";
import { PublicLayout } from "../components/public-layout";
import { APP_NAME, DAPP_URL } from "../constants";

export interface IData {
  org_name: string;
  registrant_first_name: string;
  endow_id: string;
}

function Jsx({ org_name, registrant_first_name, endow_id }: IData) {
  const profile_link = `${DAPP_URL}/profile/${endow_id}`;

  return (
    <PublicLayout type="registration">
      <Text>Hi {registrant_first_name},</Text>
      <Text>
        We've got great news for you: the documentation you provided was
        successfully vetted by our team and approved. {org_name}'s account is
        now live!
      </Text>
      <Text>
        You can see {org_name}'s profile here:{" "}
        <Link href={profile_link}>{profile_link}</Link> and start receiving
        donations from visitors.
      </Text>
      <Text>
        Once you've logged in with your email, your profile page is where you
        can access your account's Admin area and edit your profile.
      </Text>
      <Text>
        NOTE: your details will NOT be visible on the marketplace until you have
        'published' your new page, with a nice banner, words about your
        organization and such as social media links. That all helps potential
        donors decide to donate!
      </Text>
      <Text>
        Details on all aspects of editing your page can be found{" "}
        <Link href="https://intercom.help/better-giving/en/articles/7064094-how-do-we-edit-the-overview-on-our-better-giving-page">
          here
        </Link>
        .
      </Text>
      <Text>
        Along with a {APP_NAME} marketplace page to enable 'global browsers' to
        see your nonprofit, the use of the embedded donation form on your own
        website donation page is key to the success of increasing your
        donations. Instruction on how to do that{" "}
        <Link href="https://intercom.help/better-giving/en/articles/7188194-add-a-donation-form-to-your-own-site">
          can be found here
        </Link>
        .
      </Text>
    </PublicLayout>
  );
}

export const template = (data: IData) => {
  return {
    node: <Jsx {...data} />,
    subject: `Good news! ${data.org_name}'s account has been created!`,
  };
};
