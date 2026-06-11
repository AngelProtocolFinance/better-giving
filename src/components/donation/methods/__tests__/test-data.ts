import type { ReactNode } from "react";
import { createRoutesStub, Outlet } from "react-router";
import type { DonateData } from "#/api/donate-loader";
import type { AuthUser } from "#/types/auth";
import type { INpo } from "$/pg/queries/npo";

const endow = {
  id: 1,
  registration_number: "E001",
  name: "Global Education Fund",
  endow_designation: "Charity",
  hq_country: "United States",
  active_in_countries: ["United States", "India", "Kenya"],
  social_media_urls: {
    twitter: "https://twitter.com/globaledfund",
    facebook: "https://facebook.com/globaledfund",
  },
  sdgs: [1],
  kyc_donors_only: false,
  fiscal_sponsored: true,
  claimed: true,
} as INpo;

const test_donate_data: DonateData = {
  id: 1,
  endow,
  base_url: "",
};

interface Data {
  root?: Partial<AuthUser>;
  ldr?: DonateData;
}
export const stb = (node: ReactNode, data?: Data) => {
  const { root = null, ldr = test_donate_data } = data || {};
  return createRoutesStub([
    {
      path: "/",
      id: "root",
      loader: () => Promise.resolve(root),
      children: [{ Component: () => node, index: true, loader: () => ldr }],
      Component: Outlet,
      HydrateFallback: () => null,
    },
  ]);
};
