import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: "Recurring-Donor Portability Guarantee",
    description:
      "Your donors are yours — including your recurring donors. Better Giving's commitment to help every nonprofit take their donor data and recurring donors with them if they ever leave.",
  });

export default function PortabilityGuarantee() {
  return (
    <main className="prose lg:prose-lg xl:container xl:mx-auto px-5 py-20">
      <i className="text-muted-fg text-right block">Effective July 2, 2026</i>
      <h2>Recurring-Donor Portability Guarantee</h2>
      <p>
        <em>Your donors are yours — including your recurring donors.</em>
      </p>

      <h3>Why this exists</h3>
      <p>
        Most fundraising platforms will let you export a spreadsheet of your
        donor history. Almost none will help you move your recurring donors —
        the monthly, card-on-file supporters who are the steadiest part of your
        budget. Those donors' payment credentials are locked inside the
        platform's processor, and switching providers usually means starting
        those relationships over from zero. That “soft contract” traps
        nonprofits on tools that no longer serve them.
      </p>
      <p>
        We think that's backwards. Your donors are yours. So we make this
        guarantee to every organization on the Better Giving managed platform —
        and we design the open-source path so the question never even arises.
      </p>

      <h3>The guarantee, in one paragraph</h3>
      <p>
        Your donors are yours — including your recurring donors. If you ever
        choose to leave Better Giving, we will actively help you take your donor
        data and your recurring donors with you. We will never hold your data,
        your funds, or your monthly givers hostage to keep your business. No
        exit fees, no hostage-taking, no fine print.
      </p>

      <h3>The full guarantee</h3>
      <p>
        For every organization using the Better Giving managed platform, we
        commit to the following.
      </p>

      <h4>1. Your donor data belongs to you</h4>
      <p>
        Every donor record we hold on your behalf — names, contact details, gift
        amounts, frequency, and full giving history — belongs to your
        organization. You can export all of it at any time, in a standard,
        machine-readable format (CSV and via API), at no charge and without
        asking permission.
      </p>

      <h4>2. Your recurring donors are portable</h4>
      <p>
        If you decide to move to another provider, we will actively facilitate
        the secure migration of your recurring-donor payment records to your new
        processor, to the fullest extent permitted by card-network rules and
        PCI-DSS. Concretely, we will:
      </p>
      <ul>
        <li>
          Initiate and cooperate with a compliant processor-to-processor
          transfer of stored card credentials and network tokens wherever the
          card networks and both processors allow it;
        </li>
        <li>
          Where a direct credential transfer isn't permitted, provide everything
          needed to rebuild those relationships quickly — the complete
          recurring-gift schedule (donor, amount, frequency, start date, next
          charge date) plus donor contact details — and support a
          re-authorization (“re-tokenization”) campaign so donors can confirm
          their monthly gift on your new platform with minimal friction;
        </li>
        <li>
          Never quietly cancel, degrade, or interfere with your recurring gifts
          during a transition.
        </li>
      </ul>

      <h4>3. No exit toll</h4>
      <p>
        We will not condition the release of your data, your funds, or your
        donor relationships on continued use of Better Giving, on agreeing to
        new commercial terms, or on paying any exit fee, except where release is
        restricted by law, regulation, court or network order, or a legitimate
        payment hold (such as chargeback reserves or fraud review). Migration
        assistance is provided at no cost.
      </p>

      <h4>4. We help, not hinder</h4>
      <p>
        When you tell us you're leaving, we treat it as a service, not a threat.
        Provided you have given us the authorizations and information we need,
        and subject to events beyond our reasonable control, we will:
      </p>
      <ul>
        <li>
          Acknowledge a migration request within 2 business days and assign a
          point of contact;
        </li>
        <li>Deliver your full data export within 5 business days;</li>
        <li>
          Begin the recurring-donor transfer within 10 business days and use
          commercially reasonable efforts to complete it, keeping you updated
          throughout. Completion may depend on card-network rules, PCI-DSS, and
          your new processor, as described in “What we can and can't promise.”
        </li>
      </ul>

      <h4>5. Or own it outright from day one</h4>
      <p>
        For organizations that prefer maximum control, our donation form is open
        source and self-hostable. When you run it with your own payment gateway
        and merchant account, your recurring-donor tokens are yours from the
        start and never leave your control — so there is nothing to migrate if
        you ever change anything. The managed platform gives you convenience;
        the open-source path gives you total ownership. Both keep your donors
        yours.
      </p>

      <h3>What we can and can't promise</h3>
      <p>
        We want to be honest about the mechanics, because a guarantee that
        overpromises isn't worth much:
      </p>
      <ul>
        <li>
          <strong>What's in our control, we guarantee.</strong> We will always
          initiate, cooperate with, and never obstruct a migration; we will
          always hand over your data and funds without conditions; and we will
          always do the work at no charge.
        </li>
        <li>
          <strong>What's governed by outside rules.</strong> Whether a specific
          stored card credential can be transferred directly depends on
          Visa/Mastercard and other network rules, PCI-DSS, and your new
          processor's participation — factors no platform controls. Where a
          direct transfer isn't permitted, our guarantee is that we will make
          the alternative (schedule and contact handoff plus a re-authorization
          campaign) as seamless as possible, so you keep as many recurring
          donors as possible.
        </li>
      </ul>
      <p>In short: we will never be the obstacle.</p>

      <h3>How to invoke this guarantee</h3>
      <p>
        Email <a href="mailto:support@better.giving">support@better.giving</a>{" "}
        with the subject “Migration request.” Any authorized representative of
        your organization can initiate it. We'll take it from there.
      </p>

      <h3>Relationship to our Terms of Use</h3>
      <p>
        This guarantee is part of, and supplements, the Better Giving Terms of
        Use. Where this guarantee grants your organization greater rights than
        the general Terms of Use, this guarantee controls for matters of
        donor-data export and recurring-donor portability. All other terms —
        including limitation of liability, disclaimers, and governing law —
        continue to apply as set out in the Terms of Use. Nothing in this
        guarantee expands Better Giving's liability, or limits any disclaimer or
        liability cap, beyond what the Terms of Use provide; to the extent this
        guarantee and the Terms of Use conflict on liability, the Terms of Use
        control.
      </p>
    </main>
  );
}
