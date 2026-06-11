import { Accordion } from "@base-ui/react/accordion";
import { Fragment, type PropsWithChildren } from "react";
import { href, Link } from "react-router";
import { ExtLink } from "#/components/ext-link";
import { DrawerIcon } from "#/components/icon";

interface Props {
  classes?: string;
}

export function FAQ({ classes = "" }: Props) {
  return (
    <div
      className={`${classes} md:bg-card md:border md:md:p-4 md:rounded grid gap-2 md:gap-4`}
    >
      <h2 id="faqs">Frequently asked questions</h2>
      <Accordion.Root>
        {faqs.map((faq) => (
          <Accordion.Item key={faq.id} value={String(faq.id)} className="group">
            <Accordion.Header>
              <Accordion.Trigger className="flex items-start justify-between gap-2 mb-2 w-full">
                {/* font-normal: override h3 inherited bold from base.css */}
                <span className="text-left text-sm font-normal group-data-open:font-semibold">
                  {faq.question}
                </span>
                <DrawerIcon
                  size={18}
                  is_open={false}
                  className="shrink-0 group-data-open:rotate-180"
                />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel
              keepMounted
              className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0"
            >
              <div className="text-sm grid gap-3 text-muted-fg mb-6">
                {faq.paragraphs.map((p, idx) => (
                  <Fragment key={idx}>{p}</Fragment>
                ))}
              </div>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  );
}

const faqs = [
  {
    id: 1,
    question: "How does my donation work to benefit nonprofits?",
    paragraphs: [
      <p key={0}>
        Better Giving handles all donation processing and reporting, and grants
        your donation 100% to the charitable organization you selected. This
        streamlines efforts and saves costs for the nonprofit you're supporting.
      </p>,
      <p key={1}>
        All nonprofits using Better Giving also have free access to high-yield
        savings and managed investment funds, meaning they can put your donation
        to work to provide for their future. When you give today, you give
        forever.
      </p>,
    ],
  },
  {
    id: 2,
    question: "Can I receive a tax receipt?",
    paragraphs: [
      <p key={0}>
        Yes! We will email you a tax receipt immediately after your donation.
      </p>,
      <p key={1}>
        To ensure deductibility, please check with your tax advisor, as rules
        vary by country and state.
      </p>,
      <p key={2}>
        To access your receipts or a year-end donation summary,{" "}
        <Link
          to={href("/signup")}
          className="text-primary hover:text-primary/80"
        >
          create a free donor account
        </Link>{" "}
        (
        <ExtLink
          href="https://youtu.be/74kEk7aQauA"
          className="text-primary hover:text-primary/80"
        >
          video guide
        </ExtLink>
        ).
      </p>,
    ],
  },
  {
    id: 3,
    question: "How much does Better Giving charge?",
    paragraphs: [
      <p key={0}>
        It is free to set up and use a Better Giving account. No subscriptions.
        No upfront costs. No platform fees (unless a nonprofit has opted out of
        offering donors a voluntary donation to Better Giving).
      </p>,
      <p key={1}>Payment processing fees from 3rd parties may apply.</p>,
    ],
  },
  {
    id: 4,
    question: "How do I donate by Check?",
    paragraphs: [
      <p key={0} className="leading-normal">
        For gifts by check: Make your check out to{" "}
        <Em classes="text-fg">Better Giving, Inc.</Em> and send it to:{" "}
        <Em intensity={1} classes="text-fg block mt-2">
          Better Giving, Inc.
          <br /> 18 Cottekill Rd
          <br /> Rosendale, NY 12472
        </Em>
      </p>,
      <p key={1}>
        IMPORTANT: Add the name of the Nonprofit you are donating to in the
        memo.
      </p>,
      <p key={2}>
        If you would like to add a contribution for Better Giving to help keep
        our services free, you may add that in the memo with{" "}
        <Em
          intensity={1}
          classes="text-fg text-xs font-mono bg-secondary p-0.5"
        >
          BG:&nbsp;$amount
        </Em>
        .
      </p>,
    ],
  },
];

function Em({
  classes = "",
  children,
  intensity = 1,
}: PropsWithChildren & { intensity?: 1 | 2 | 3; classes?: string }) {
  return (
    <span
      className={`${
        intensity === 1
          ? "font-medium"
          : intensity === 2
            ? "font-semibold"
            : "font-semibold text-fg"
      } ${classes}`}
    >
      {children}
    </span>
  );
}
