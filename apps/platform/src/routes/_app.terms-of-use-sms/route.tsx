import { href, Link } from "react-router";
import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({ title: "SMS Terms & Conditions | Text-to-Give" });

export default function TermsSms() {
  return (
    <div className="xl:container xl:mx-auto px-5 prose lg:prose-lg py-20">
      <h1 className="text-center">Text-to-Give SMS Terms & Conditions</h1>
      <p>
        <strong>Last updated:</strong> January 2025
      </p>

      <section>
        <h2>How It Works</h2>
        <p>
          Our Text-to-Give service allows you to make donations via SMS to
          participating nonprofit organizations.
        </p>
        <p>To donate, send a text message to:</p>
        <p>
          <strong>+1 866 477 4156</strong>
        </p>
        <p>Using the format:</p>
        <pre>[NONPROFIT] GIVE [AMOUNT]</pre>
        <p>
          For example: <code>BETTERGIVING GIVE 50</code> to donate $50 to{" "}
          {app_name}.
        </p>
      </section>

      <section>
        <h2>Consent & Opt-In</h2>
        <p>
          By sending a text message to our number, you consent to receive the
          following SMS messages:
        </p>
        <ul>
          <li>A reply containing a secure link to complete your donation</li>
          <li>A confirmation message once your donation is processed</li>
          <li>A donation receipt for your records</li>
        </ul>
        <p>
          You will receive a maximum of <strong>3 messages per donation</strong>
          . We do not send marketing or promotional messages.
        </p>
      </section>

      <section>
        <h2>Opt-Out Instructions</h2>
        <p>You may opt out at any time by texting:</p>
        <ul>
          <li>
            <strong>STOP</strong> — Unsubscribe from all messages
          </li>
          <li>
            <strong>HELP</strong> — Receive support information
          </li>
        </ul>
        <p>
          After opting out, you will receive a single confirmation message. You
          will not receive any further messages unless you initiate a new
          donation.
        </p>
      </section>

      <section>
        <h2>Message & Data Rates</h2>
        <p>
          Standard message and data rates may apply based on your mobile carrier
          plan. We are not responsible for any fees charged by your carrier.
        </p>
      </section>

      <section>
        <h2>Supported Carriers</h2>
        <p>
          Our service is compatible with all major US carriers including AT&T,
          Verizon, T-Mobile, Sprint, and most regional carriers.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          Your phone number is used solely to process your donation and send
          transactional messages. We do not sell, share, or rent your phone
          number to third parties.
        </p>
        <p>
          For more information, please see our{" "}
          <Link to={href("/privacy-policy")}>Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Contact Us</h2>
        <p>
          If you have questions about our Text-to-Give service, please contact
          us:
        </p>
        <address>
          Email:{" "}
          <a href="mailto:support@better.giving">support@better.giving</a>
        </address>
      </section>

      <footer className="mt-12 pt-6 border-t">
        <p>© 2025 {app_name}. All rights reserved.</p>
        <nav className="flex gap-2">
          <Link to={href("/privacy-policy")}>Privacy Policy</Link>
          <span>|</span>
          <Link to={href("/terms-of-use")}>Terms of Service</Link>
        </nav>
      </footer>
    </div>
  );
}
