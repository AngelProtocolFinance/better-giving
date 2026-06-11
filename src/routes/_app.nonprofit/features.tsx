import {
  BarChart2,
  CreditCard,
  Database,
  FileText,
  Gift,
  Globe,
  MousePointer,
  Paintbrush,
  QrCode,
  RefreshCcw,
  Shapes,
  Target,
  UserCircle,
} from "lucide-react";
import type { ReactNode } from "react";

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
    body: "Flexible contributions – Accept cash, credit, crypto, stock, and donor-advised funds (DAFs).",
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
    title: "Scan to Donate",
    icon: <QrCode className="text-primary" />,
    body: "Quick giving – Enable easy donations via QR codes for mobile and event fundraising.",
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
    id: 12,
    title: "Dedicated Fundraising Profile",
    icon: <UserCircle className="text-primary" />,
    body: "Boost visibility – Create a dedicated profile to showcase your campaigns and engage donors.",
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
    <div className={`${classes} grid @xl:grid-cols-2 @4xl:grid-cols-3 gap-4`}>
      <h4 className="text-lg  text-primary uppercase -mb-4 col-span-full text-center @4xl:text-left">
        Features
      </h4>
      <div className="row-span-2 col-span-full @4xl:col-span-2 pb-8">
        <h3 className="text-2xl @4xl:text-3xl mb-4 text-center @4xl:text-left">
          Smarter tools for seamless fundraising
        </h3>
        <p className="text-lg text-center @4xl:text-left">
          Raise funds, grow donations, and secure financial stability—all with
          no platform fees.
        </p>
      </div>
      {features.map((f) => (
        <Feature key={f.id} {...f} />
      ))}
    </div>
  );
}

function Feature(props: IFeature) {
  return (
    <div className="p-4 border rounded grid grid-rows-subgrid row-span-2">
      <div className="flex items-center gap-x-2">
        {props.icon}
        <p className="font-bold text-sm ">{props.title}</p>
      </div>
      <p>{props.body}</p>
    </div>
  );
}
