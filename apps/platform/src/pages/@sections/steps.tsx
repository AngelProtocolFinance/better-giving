import { Image } from "@better-giving/ui";
import { motion } from "motion/react";
import { href, Link } from "react-router";
import laira1 from "#/assets/laira/laira1.webp";
import laira2 from "#/assets/laira/laira2.webp";
import laira3 from "#/assets/laira/laira3.webp";
import { app_name } from "#/constants/env";
import { BOOK_A_DEMO } from "#/constants/urls";

type TListItem = {
  title: string;
  description: string;
  image: { src: string; width?: number; height?: number; alt: string };
};
const items: TListItem[] = [
  {
    title: "Sign up",
    description: `Join ${app_name}. No platform fee while the optional donor contribution stays on. Turning that ask off is a 1.5% fee.`,
    image: {
      src: laira1,
      width: 95,
      height: 172,
      alt: "Laira holding number 1",
    },
  },
  {
    title: "Add the donation form ",
    description:
      "Fewer clicks + more donation types + express checkout = more completed gifts and monthly donors.",
    image: {
      src: laira2,
      width: 95,
      height: 172,
      alt: "Laira holding number 2",
    },
  },
  {
    title: "Grow",
    description:
      "Let your hard earned donations work for you with passive high-yield savings & managed investments.",
    image: {
      src: laira3,
      width: 115,
      height: 173,
      alt: "Laira holding number 3",
    },
  },
];

export function Steps({ classes = "" }) {
  return (
    <section className={`${classes} grid content-start`}>
      <motion.h3
        className="section-heading"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring" }}
      >
        Easy as 1-2-3
      </motion.h3>

      {/* order is the list's and the row's: no step numbers, no rules */}
      <ol className="mt-12 grid gap-6 lg:grid-cols-3">
        {items.map((item, idx) => (
          <ListItem {...item} key={idx} index={idx} />
        ))}
      </ol>
      <motion.p
        className="max-w-3xl mt-12 text-lg text-pretty"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring", delay: 0.4 }}
      >
        We help nonprofits like yours{" "}
        <span className="font-bold">grow gifts</span> by accepting all donation
        methods, <span className="font-bold">grow capacity</span> by handling
        all admin & reporting work, and{" "}
        <span className="font-bold">grow funds</span> with simple high-yield
        savings and investments.
      </motion.p>
      <motion.div
        className="flex max-md:flex-col md:items-center gap-4 mt-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring", delay: 0.5 }}
      >
        <Link
          to={href("/register")}
          className="btn btn-lg btn-primary inline-flex items-center font-bold"
        >
          Join us today!
        </Link>
        <Link
          to={BOOK_A_DEMO}
          className="btn btn-lg btn-secondary inline-flex items-center font-bold"
        >
          Book a Demo
        </Link>
      </motion.div>
    </section>
  );
}

function ListItem(props: TListItem & { index: number }) {
  return (
    // subgrid so the three titles and the three descriptions share a line
    // across the row whatever the mascots' heights
    <motion.li
      className="tile grid content-start gap-4 lg:grid-rows-subgrid lg:row-span-3"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ type: "spring", delay: props.index * 0.1 }}
    >
      <Image
        src={props.image.src}
        height={props.image.height}
        width={props.image.width}
        alt={props.image.alt}
        className="self-end justify-self-start"
      />
      <h4 className="subsection-heading">{props.title}</h4>
      <p className="text-lg text-gray-11 text-pretty">{props.description}</p>
    </motion.li>
  );
}
