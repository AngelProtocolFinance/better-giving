import { useState } from "react";
import { Link } from "react-router";
import laira_announce from "#/assets/laira/laira-announce.webp";
import { Image } from "#/components/image";
import { app_name } from "#/constants/env";
import { metas } from "#/helpers/seo";
import {
  type OgInput,
  type OgInputParams,
  ogInputDefault,
} from "#/types/donation-calculator";
import type { Route } from "./+types/route";
import { Benefits } from "./benefits";
import { bgView } from "./bg-view";
import { BottomCta } from "./bottom-cta";
import { Chart } from "./chart";
import { Docs } from "./docs";
import { Form1 } from "./form1";
import { Form2 } from "./form2";
import { Hero } from "./hero";
import heroImg from "./hero.png?url";
import { Result1 } from "./result1";
import { Table } from "./table";

export const meta: Route.MetaFunction = () =>
  metas({
    title: "Better Giving Donation Calculator | Save More, Raise More, Do More",
    description:
      " Use Better Giving’s Donation Calculator to see how your nonprofit can lower fees, accept more donation types, and grow funds automatically through smart processing and investing — all in one free platform.",
    image: heroImg,
  });

export default function Page() {
  const [state, setState] = useState<OgInput>(ogInputDefault);
  const params: OgInputParams = {
    amnt: state.amnt.toString(),
    processingFeeRate: state.processingFeeRate.toString(),
    processingFeeCovered: state.processingFeeCovered.toString(),
    platformFeeRate: state.platformFeeRate.toString(),
    subsCost: state.subsCost.toString(),
    donMethods: ["credit-card"].join(","),
    notGrantedRate: state.notGrantedRate.toString(),
    investRate: state.investRate.toString(),
  };

  const view = bgView(state);

  return (
    <div className="relative pb-8">
      <div className="bg-primary">
        <Hero classes="xl:container px-5 mx-auto" />
      </div>
      <div className="xl:container px-5 mx-auto mt-4 py-8 grid sm:grid-cols-2 gap-x-4 content-start">
        <h2 className="text-balance text-2xl sm:text-3xl text-primary mb-6 text-center col-span-2">
          Donation Processing Calculator
        </h2>
        <Link
          reloadDocument
          className="col-start-2 justify-self-end mb-2 btn-primary px-4 py-1 rounded text-sm"
          to={{
            pathname: "../donation-calculator-export",
            search: new URLSearchParams(params).toString(),
          }}
        >
          Export to pdf
        </Link>
        {/* <Exporter view={view} classes="col-start-2 justify-self-end mb-2" /> */}

        <div className="grid sm:grid-cols-subgrid col-span-2 bg-card p-4 rounded shadow-sm">
          <Form1 state={state} setState={setState} classes="sm:border-r" />
          <Result1 {...view} classes="" />
        </div>
      </div>
      <div className="grid content-center bg-primary py-8">
        <div className="max-md:grid max-md:justify-items-center max-md:gap-y-2 md:relative justify-self-center">
          <div className="md:absolute md:-left-4 md:-bottom-2 shrink-0">
            <Image
              alt="laira announce"
              src={laira_announce}
              width={90}
              className="z-10 max-md:w-24"
            />
            {/** shadow */}
            <svg
              className="absolute -bottom-3 z-0"
              width="100%"
              height="20"
              aria-hidden="true"
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
                className="fill-neutral/30"
                // className="blur-sm"
              />
            </svg>
          </div>
          <p className="text-balance max-w-2xl text-center text-lg sm:text-xl text-primary-fg">
            There's more! {app_name}’s savings & investment services can support
            your long term future
          </p>
        </div>
      </div>
      <div className="xl:container px-5 mx-auto mt-4 py-8 grid sm:grid-cols-2 gap-x-4 content-start">
        <h2 className="mt-8 text-balance text-2xl sm:text-3xl text-primary mb-6 text-center col-span-2">
          Savings & Investment Calculator
        </h2>

        <div className="grid sm:grid-cols-subgrid col-span-2 bg-card p-4 rounded shadow-sm">
          <Form2 state={state} setState={setState} classes="sm:border-r" />
          <Table {...view} classes="" />
          {/* <Result2 {...view} classes="" /> */}
        </div>
        <h2 className="text-balance text-2xl sm:text-3xl text-primary mt-12 mb-1 text-center col-span-2">
          Total Annual Impact
        </h2>
        <Chart {...view} classes="mt-6 max-sm:col-span-2 row-span-3" />
        <Benefits classes="mt-6 max-sm:col-span-2" />
        <Docs classes="mt-6 self-start col-start-2 max-sm:col-span-2" />
        <BottomCta className="col-span-2 sm:grid-cols-2 mt-6" />
      </div>
    </div>
  );
}
