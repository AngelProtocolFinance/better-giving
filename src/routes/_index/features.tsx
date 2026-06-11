import {
  BarChart2,
  CreditCard,
  Database,
  FileText,
  Gift,
  Globe,
  MousePointer,
  Paintbrush,
  RefreshCcw,
  Shapes,
  Target,
  UsersIcon,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { href, Link } from "react-router";
import { app_name } from "#/constants/env";

const MLink = motion.create(Link);

interface IFeature {
  id: number;
  title: string;
  icon: ReactNode;
  body: string;
}
const features: IFeature[] = [
  {
    id: 1,
    title: "Recurring Donations",
    icon: <RefreshCcw className="text-primary" />,
    body: "Stabilize revenue – Ensure predictable, ongoing support with automated recurring donations.",
  },
  {
    id: 2,
    title: "Multiple Donation Types",
    icon: <Shapes className="text-primary" />,
    body: "Flexible Contributions - Accept cash, credit, bank transfers, crypto, stock and donor-advised funds (DAFs).",
  },
  {
    id: 3,
    title: "Global Donor Access",
    icon: <Globe className="text-primary" />,
    body: "Expand reach – Accept donations worldwide with localized multi-currency support.",
  },
  {
    id: 4,
    title: "Customizable & Embeddable Forms",
    icon: <Paintbrush className="text-primary" />,
    body: "Seamless branding – Embed fully branded, customizable forms directly on your website.",
  },
  {
    id: 5,
    title: "Goal Tracking Progress Bars",
    icon: <BarChart2 className="text-primary" />,
    body: "Boost engagement – Show real-time progress with progress bars to motivate donors.",
  },
  {
    id: 6,
    title: "Peer-to-Peer Fundraising",
    icon: <UsersIcon className="text-primary" />,
    body: "Empower every supporter to become a fundraiser and crowdfund with ease.",
  },
  {
    id: 7,
    title: "Dedication Gifts",
    icon: <Gift className="text-primary" />,
    body: "Personalize giving – Let donors dedicate their gifts to someone special, adding a personal touch.",
  },
  {
    id: 8,
    title: "Donors Covering Processing Fees",
    icon: <CreditCard className="text-primary" />,
    body: "Full donations – 95% of donors choose to cover transaction fees so nonprofits receive 100% of the gift.",
  },
  {
    id: 9,
    title: "Program-Specific Fundraising",
    icon: <Target className="text-primary" />,
    body: "Targeted giving – Let donors fund specific programs or initiatives aligned with their interests.",
  },
  {
    id: 10,
    title: "Donor Information Access",
    icon: <Database className="text-primary" />,
    body: "Actionable insights – Access complete donor data for personalized outreach and retention.",
  },
  {
    id: 11,
    title: "Conversion-Optimized UI/UX",
    icon: <MousePointer className="text-primary" />,
    body: "Maximize donations – An intuitive, user-friendly interface increases completed donations.",
  },
  {
    id: 13,
    title: "Automated Tax Reporting & Receipts",
    icon: <FileText className="text-primary" />,
    body: "Simplify compliance – We handle tax receipts and reporting, reducing your administrative burden.",
  },
];

export function Features({ classes = "" }) {
  return (
    <section
      className={`${classes} grid lg:grid-cols-2 xl:grid-cols-3 gap-4 py-8`}
      aria-labelledby="features-heading"
    >
      <motion.p
        className="pre-heading text-primary uppercase -mb-4 col-span-full text-center xl:text-left"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring" }}
      >
        Features
      </motion.p>
      <motion.header
        className="row-span-2 col-span-full pb-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring", delay: 0.1 }}
      >
        <h2
          id="features-heading"
          className="mb-4 text-center xl:text-left section-heading"
        >
          Smarter Tools for seamless fundraising
        </h2>
        <p className="text-lg text-center xl:text-left">
          Raise funds, grow donations, and secure financial stability—all with
          no platform fees.
        </p>
      </motion.header>
      <ul className="contents">
        {features.map((f, idx) => (
          <Feature key={f.id} {...f} index={idx} />
        ))}
      </ul>

      <MLink
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring" }}
        to={href("/register/welcome")}
        className="text-center capitalize col-span-full justify-self-center btn btn-primary ml-1 font-bold inline-flex items-center px-10 py-3 gap-1 rounded text-lg mt-4"
      >
        Explore all {app_name} features
      </MLink>
    </section>
  );
}

function Feature(props: IFeature & { index: number }) {
  return (
    <motion.li
      className="p-4 rounded grid grid-rows-subgrid row-span-2 bg-card border"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ type: "spring", delay: (props.index % 6) * 0.05 }}
    >
      <div className="flex items-center gap-x-2">
        {props.icon}
        <h3 className="font-bold text-sm ">{props.title}</h3>
      </div>
      <p>{props.body}</p>
    </motion.li>
  );
}
