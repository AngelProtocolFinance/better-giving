import {
  ArrowRight,
  DollarSignIcon,
  Handshake,
  SproutIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { href, Link } from "react-router";

interface IListItem {
  title: string;
  description: string;
  icon: ReactNode;
}

const items: IListItem[] = [
  {
    title: "Make an Impact",
    description:
      "Every nonprofit you refer can access free, powerful fundraising tools.",
    icon: <SproutIcon size={40} className="text-success" />,
  },
  {
    title: "Earn Effortlessly",
    description:
      "Share your unique link and earn whenever your nonprofits receive donations.",
    icon: <DollarSignIcon size={40} className="text-primary" />,
  },
  {
    title: "Be Part of a Movement",
    description:
      "Join a growing community of supporters, fundraisers, and changemakers.",
    icon: <Handshake className="text-warning" size={35} />,
  },
];

export function Feature({ className = "" }) {
  return (
    <section className={`${className} py-10 xl:py-20 grid content-start`}>
      <h2 className="text-3xl md:text-4xl text-balance mb-6 text-center col-span-full">
        Why Share Better Giving?
      </h2>

      <ul className="col-span-full mt-4 lg:divide-x divide-border grid gap-y-20 lg:gap-y-0 lg:grid-cols-3">
        {items.map((item, idx) => (
          <ListItem {...item} key={idx} />
        ))}
      </ul>

      <Link
        to={{
          pathname: href("/signup"),
          search: `?redirect=${href("/dashboard/referrals")}`,
        }}
        className="btn btn-primary mt-8 justify-self-center col-span-full ml-1 font-bold inline-flex items-center px-10 py-3 gap-1 rounded text-lg"
      >
        Become an Affiliate
        <ArrowRight size={18} />
      </Link>
    </section>
  );
}

function ListItem(props: IListItem) {
  return (
    <li className="grid lg:grid-rows-subgrid row-span-3 px-9 justify-items-center">
      {props.icon}
      <h3 className="mt-4 py-4 text-center font-medium  text-2xl border-b-[3px] border-primary mb-7 px-8">
        {props.title}
      </h3>
      <p className="text-center text-lg @6xl:text-xl">{props.description}</p>
    </li>
  );
}
