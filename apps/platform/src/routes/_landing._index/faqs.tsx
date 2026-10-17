// home faq copy is final per design handoff — distinct from #/pages/@sections/faq data
// faqpage json-ld deferred: answers are jsx nodes, schema requires plain-text acceptedAnswer.text
export const home_faqs = [
  {
    id: 0,
    question: "Is Better Giving really free? How do you sustain operations?",
    paragraphs: [
      <p key={0}>
        Yes, all features included. We're a volunteer-driven 501(c)(3). Donors
        can add an optional contribution at checkout. It is opt-in and starts
        off. There is no platform fee while that ask stays on the form. Turning
        it off is a 1.5% fee. Fiscal sponsorship is 2.9% of each sponsored gift.
        There are no gated features.
      </p>,
    ],
  },
  {
    id: 1,
    question: "What types of donations can I accept?",
    paragraphs: [
      <p key={0}>
        Card, bank/ACH, PayPal, Apple Pay and Google Pay, stock, donor-advised
        funds (DAF), IRA/QCD, and crypto. All in one embeddable form. Non-cash
        gifts like stock and crypto are liquidated and granted to you as cash.
      </p>,
    ],
  },
  {
    id: 2,
    question: "How quickly can I start fundraising?",
    paragraphs: [
      <p key={0}>
        Register in minutes. Embedding the form on your site is a copy-paste
        snippet. Grants and withdrawal requests are reviewed and processed on a
        monthly basis.
      </p>,
    ],
  },
  {
    id: 3,
    question: "Do I keep my donor data (and my donors) if I leave?",
    paragraphs: [
      <p key={0}>
        You can export donation records from your dashboard. We do not transfer
        stored card credentials to another processor, and there is no outbound
        migration to start. A donor who wants to keep giving after you leave
        authorizes a new gift with the new provider.
      </p>,
    ],
  },
  {
    id: 4,
    question: 'What does "open source" mean for my nonprofit?',
    paragraphs: [
      <p key={0}>
        Our code is public, so you can read exactly how donations are handled
        instead of taking our word for it. Nonprofits use the managed platform.
      </p>,
    ],
  },
];
