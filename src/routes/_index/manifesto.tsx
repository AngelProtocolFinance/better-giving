import { Tabs } from "@base-ui/react/tabs";
import { motion } from "motion/react";
import alliance_member_badge from "#/assets/images/alliance-member-badge-hexagon.webp";
import alliance_member_badge_rect from "#/assets/images/alliance-member-badge-rectangle.webp";
import laira_pointing from "#/assets/laira/laira-pointing.webp";
import laira_yellow from "#/assets/laira/laira-yellow.webp";
import { app_name } from "#/constants/env";

export function Manifesto({ classes = "" }) {
  return (
    <section className={`${classes} grid pb-40`}>
      <motion.div
        className="relative w-full max-w-4xl justify-self-center rounded border-t p-4 sm:p-12 shadow-2xl shadow-black/10"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring" }}
      >
        <div className="max-xl:hidden absolute -left-32 isolate -bottom-5">
          <img
            src={laira_pointing}
            width={120}
            height={152}
            className="z-10 max-sm:w-24"
            alt=""
          />
          {/** shadow */}
          <svg
            aria-hidden="true"
            className="absolute -bottom-4 left-0 z-0"
            width="100%"
            height="20"
          >
            <defs>
              <filter id="blur">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
              </filter>
            </defs>
            <ellipse
              cx="50%"
              cy="50%"
              rx="50"
              ry="8"
              filter="url(#blur)"
              className="fill-muted"
              // className="blur-sm"
            />
          </svg>
        </div>
        <h2 className="text-center section-heading">
          <span className="text-primary">Membership</span> means belonging.
        </h2>
        <p className="text-center mb-8 col-span-full text-xl mt-4 max-w-5xl justify-self-center">
          Membership isn't a program, it's how we show up for each other. As a
          nonprofit ourselves, {app_name} makes every nonprofit a Member by
          default, with shared tools, shared growth, and shared responsibility.
        </p>

        <Tabs.Root className="mt-4" defaultValue="rights">
          <Tabs.List className="flex mb-2 gap-x-1">
            <Tabs.Tab
              value="rights"
              className="focus:outline-none px-4 pb-2 font-bold text-lg data-active:border-primary border-b-2"
            >
              Your Rights
            </Tabs.Tab>
            <Tabs.Tab
              value="benefits"
              className="focus:outline-none px-4 pb-2 font-bold text-lg data-active:border-primary border-b-2"
            >
              Your Benefits
            </Tabs.Tab>
            <Tabs.Tab
              value="part"
              className="focus:outline-none px-4 pb-2 font-bold text-lg data-active:border-primary border-b-2"
            >
              Your Part
            </Tabs.Tab>
          </Tabs.List>

          <div className="mt-6">
            <Tabs.Panel value="rights" className="">
              <p className="text-lg xl:text-xl mb-4 font-bold">
                The {app_name} Manifesto — your three rights:
              </p>
              <ul className="space-y-2 text-muted-fg xl:text-lg list-disc list-inside">
                <li>
                  <span className="font-bold">Financial Self-Sufficiency</span>:
                  grow durable reserves; access tools for long-term stability.
                </li>
                <li>
                  <span className="font-bold">Equal Opportunity</span>: fair
                  access to modern fundraising & finance, regardless of size,
                  location, or cause.
                </li>
                <li>
                  <span className="font-bold">Organizational Autonomy</span>:
                  independence to allocate funds and reduce admin drag on your
                  terms.
                </li>
              </ul>
            </Tabs.Panel>

            <Tabs.Panel value="benefits" className="">
              <p className="text-lg xl:text-xl mb-4 font-bold">
                Member Benefits (always included):
              </p>
              <ul className="space-y-2 text-muted-fg xl:text-lg list-disc list-inside">
                <li>White-glove embed help (real humans, fast setup)</li>
                <li>Automated receipts & reporting</li>
                <li>Educational webinars</li>
                <li>
                  Member Badge in your donation form (stewardship donors can
                  see)
                </li>
                <li>Member Spotlights (monthly stories you can copy)</li>
              </ul>
            </Tabs.Panel>

            <Tabs.Panel
              value="part"
              className="grid grid-cols-2 @container/panel"
            >
              <p className="text-lg xl:text-xl mb-4 font-bold col-span-full">
                Member Reciprocity (light, but important):
              </p>
              <ul className="@max-2xl/panel:col-span-full space-y-2 text-muted-fg xl:text-lg list-decimal list-inside">
                <li>Show the badge.</li>
                <li>Share one win each year (we'll help write it).</li>
                <li>Invite a peer via your referral link.</li>
              </ul>
              <div className="flex gap-4 flex-wrap justify-center @max-2xl/panel:justify-center self-start @2xl/panel:-mt-28 @max-2xl/panel:col-start-1 @max-2xl/panel:col-span-full @max-2xl/panel:mt-6 w-full">
                <motion.img
                  src={alliance_member_badge}
                  width={240}
                  height={240}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  alt="Better Giving Alliance member badge (hexagon)"
                />
                <motion.img
                  className="@2xl/panel:hidden object-contain"
                  src={alliance_member_badge_rect}
                  width={270}
                  height={140}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  alt="Better Giving Alliance member badge (rectangle)"
                />
              </div>
            </Tabs.Panel>
          </div>
        </Tabs.Root>
        <div className="max-xl:hidden absolute -right-28 isolate -bottom-2">
          <img
            src={laira_yellow}
            width={90}
            height={116}
            className="z-10 max-sm:w-24 rotate-y-180"
            alt=""
          />
          {/** shadow */}
          <svg
            aria-hidden="true"
            className="absolute -bottom-3 z-0"
            width="100%"
            height="20"
          >
            <defs>
              <filter id="blur">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
              </filter>
            </defs>
            <ellipse
              cx="50%"
              cy="50%"
              rx="40"
              ry="6"
              filter="url(#blur)"
              className="fill-muted"
              // className="blur-sm"
            />
          </svg>
        </div>
      </motion.div>
    </section>
  );
}
