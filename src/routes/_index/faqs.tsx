// home faq copy is final per design handoff — distinct from #/pages/@sections/faq data
// faqpage json-ld deferred: answers are jsx nodes, schema requires plain-text acceptedAnswer.text
export const home_faqs = [
  {
    id: 0,
    question: "Is Better Giving really free? How do you sustain operations?",
    paragraphs: [
      <p key={0}>
        Yes, completely free, all features included, and we grant out 100% of
        donations. We're a volunteer-driven 501(c)(3) sustained by optional
        donor contributions at checkout, which are always opt-in and never
        pre-selected. There are no platform fees, fund-management fees, or gated
        features.
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
        Register in minutes. We review and get you started right away. Embedding
        the form on your site is a copy-paste snippet, and payouts arrive
        electronically within 5 working days.
      </p>,
    ],
  },
  {
    id: 3,
    question: "Do I keep my donor data (and my donors) if I leave?",
    paragraphs: [
      <p key={0}>
        Yes. You receive full donor-level data, exportable anytime (CSV and API)
        at no charge. And under our Recurring-Donor Portability Guarantee, if
        you ever switch providers we actively help migrate your recurring
        donors. No exit fees, no fine print.
      </p>,
    ],
  },
  {
    id: 4,
    question: 'What does "open source" mean for my nonprofit?',
    paragraphs: [
      <p key={0}>
        Our code is public, so you can verify exactly how donations are handled
        instead of taking our word for it. Most members use the managed platform
        for convenience; if you want full independence, you can self-host the
        donation form and own your own payment gateway.
      </p>,
    ],
  },
];
