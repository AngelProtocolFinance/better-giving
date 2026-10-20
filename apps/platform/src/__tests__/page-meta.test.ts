import type { MetaDescriptor } from "react-router";
import { describe, expect, test } from "vitest";
import { base_url } from "#/constants/env";
import { meta as about } from "#/routes/_app.about-us/route";
import { meta as calculator } from "#/routes/_app.donation-calculator/route";
import { meta as donor } from "#/routes/_app.donor/route";
import { meta as form_edit } from "#/routes/_app.forms.$id.edit/route";
import { meta as fundraisers } from "#/routes/_app.fundraisers._index/route";
import { meta as login } from "#/routes/_app.login/route";
import { meta as reset } from "#/routes/_app.login_.reset/route";
import { meta as marketplace } from "#/routes/_app.marketplace/route";
import { meta as privacy } from "#/routes/_app.privacy-policy/route";
import { meta as product } from "#/routes/_app.product/route";
import { meta as resources } from "#/routes/_app.resources/route";
import { meta as security } from "#/routes/_app.security-policy/route";
import { meta as signup } from "#/routes/_app.signup/route";
import { meta as signup_index } from "#/routes/_app.signup._index/route";
import { meta as wp } from "#/routes/_app.wp-plugin/route";
import { home_faqs } from "#/routes/_landing._index/faqs";
import { meta as home } from "#/routes/_landing._index/route";
import { meta as donation_forms } from "#/routes/_landing.donation-forms/route";
import { meta as fiscal } from "#/routes/_landing.fiscal-sponsorship/route";
import { meta as fund_mgmt } from "#/routes/_landing.fund-management/route";
import { meta as tuesday } from "#/routes/_landing.giving-tuesday/route";
import { meta as oss } from "#/routes/_landing.open-source/route";
import { meta as pricing } from "#/routes/_landing.pricing/route";
import { meta as donate } from "#/routes/fundraisers.$fund_id.donate/route";
import { meta as nonprofit } from "#/routes/nonprofits.$slug/route";
import { meta as referral } from "#/routes/referral-program/route";
import { meta as simplify } from "#/routes/simplify-fundraising-maximize-impact/route";
import { meta as simplify_plural } from "#/routes/simplify-fundraising-maximize-impacts/route";
import { meta as crypto } from "#/routes/the-smart-move-to-make-for-accepting-crypto-donations/route";
import { meta as unlock } from "#/routes/unlock-us-donations/route";

// static metas ignore their args
const descriptors = (meta: (args: never) => unknown) =>
  meta(undefined as never) as (MetaDescriptor & Record<string, unknown>)[];

const urls_of = (ds: (MetaDescriptor & Record<string, unknown>)[]) => ({
  canonical: ds.find((d) => d.rel === "canonical")?.href,
  og: ds.find((d) => d.property === "og:url")?.content,
  twitter: ds.find((d) => d.property === "twitter:url")?.content,
});

const pages = [
  ["/product", product],
  ["/pricing", pricing],
  ["/donation-calculator", calculator],
  ["/donor", donor],
  ["/fundraisers", fundraisers],
  ["/marketplace", marketplace],
  ["/resources", resources],
  ["/wp-plugin", wp],
  ["/privacy-policy", privacy],
  ["/security-policy", security],
  ["/donation-forms", donation_forms],
  ["/fiscal-sponsorship", fiscal],
  ["/fund-management", fund_mgmt],
  ["/giving-tuesday", tuesday],
  ["/open-source", oss],
  ["/referral-program", referral],
  ["/simplify-fundraising-maximize-impact", simplify],
  ["/simplify-fundraising-maximize-impact", simplify_plural],
  ["/the-smart-move-to-make-for-accepting-crypto-donations", crypto],
  ["/unlock-us-donations", unlock],
  ["/about-us", about],
  ["/login", login],
  ["/login/reset", reset],
  ["/signup", signup],
] as const;

describe("page canonicals", () => {
  test.each(pages)("%s canonicalizes to its own url", (path, meta) => {
    const url = `${base_url}${path}`;
    expect(urls_of(descriptors(meta))).toEqual({
      canonical: url,
      og: url,
      twitter: url,
    });
  });

  test.each(["/", "/dashboard/referrals"])(
    "signup index (%s) canonicalizes to /signup",
    (to) => {
      const url = `${base_url}/signup`;
      const ds = signup_index({
        loaderData: to,
      } as never) as (MetaDescriptor & Record<string, unknown>)[];
      expect(urls_of(ds)).toEqual({
        canonical: url,
        og: url,
        twitter: url,
      });
    }
  );

  test("a nonprofit landing canonicalizes to its own slug", () => {
    const url = `${base_url}/nonprofits/education`;
    const ds = nonprofit({
      params: { slug: "education" },
    } as never) as (MetaDescriptor & Record<string, unknown>)[];
    expect(urls_of(ds)).toEqual({
      canonical: url,
      og: url,
      twitter: url,
    });
  });

  test("fundraiser donate canonicalizes to the request path", () => {
    const url = `${base_url}/fundraisers/library-drive/donate`;
    const ds = donate({
      loaderData: { fund: { name: "Library drive" } },
      location: { pathname: "/fundraisers/library-drive/donate" },
    } as never) as (MetaDescriptor & Record<string, unknown>)[];
    expect(urls_of(ds)).toEqual({
      canonical: url,
      og: url,
      twitter: url,
    });
  });

  test("form edit canonicalizes to /forms/:id/edit", () => {
    const url = `${base_url}/forms/form-9/edit`;
    const ds = form_edit({
      loaderData: { name: "Spring appeal" },
      params: { id: "form-9" },
    } as never) as (MetaDescriptor & Record<string, unknown>)[];
    expect(urls_of(ds)).toEqual({
      canonical: url,
      og: url,
      twitter: url,
    });
  });
});

describe("home faq json-ld", () => {
  test("questions match the faq headings and answers match the rendered paragraphs", () => {
    const ds = descriptors(home);
    const faq = ds
      .map((d) => d["script:ld+json"])
      .find(
        (block): block is Record<string, unknown> =>
          !!block &&
          typeof block === "object" &&
          (block as { "@type"?: unknown })["@type"] === "FAQPage"
      );
    const main = faq?.mainEntity as
      | { name: string; acceptedAnswer: { text: string } }[]
      | undefined;

    expect(faq?.["@type"]).toBe("FAQPage");
    // accordion trigger is item.question. the visible answer is the <p> child
    // home_faq builds from the shared string — item.answer is the field the
    // schema already reads, so asserting it stays green when that read stops.
    expect(main?.map((question) => question.name)).toEqual(
      home_faqs.map((item) => item.question)
    );
    expect(main?.map((question) => question.acceptedAnswer.text)).toEqual(
      home_faqs.map((item) => item.paragraphs[0].props.children)
    );
  });
});
