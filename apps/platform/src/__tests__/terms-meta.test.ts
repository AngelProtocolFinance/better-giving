import type { MetaDescriptor } from "react-router";
import { describe, expect, test } from "vitest";
import { base_url } from "#/constants/env";
import { meta as donor_meta } from "#/routes/_app.terms-of-use/route";
import { meta as npo_meta } from "#/routes/_app.terms-of-use-npo/route";
import { meta as npo_2024_meta } from "#/routes/_app.terms-of-use-npo-2024/route";
import { meta as referrals_meta } from "#/routes/_app.terms-of-use-referrals/route";
import { meta as sms_meta } from "#/routes/_app.terms-of-use-sms/route";

// each `meta` ignores its args
const descriptors = (meta: (args: never) => unknown) =>
  meta(undefined as never) as (MetaDescriptor & Record<string, unknown>)[];

const pages = [
  ["/terms-of-use", donor_meta],
  ["/terms-of-use-npo", npo_meta],
  ["/terms-of-use-referrals", referrals_meta],
  ["/terms-of-use-sms", sms_meta],
  ["/terms-of-use-npo-2024", npo_2024_meta],
] as const;

describe("terms meta", () => {
  test.each(pages)(
    "%s canonicalizes to its own url, not the homepage",
    (path, meta) => {
      const ds = descriptors(meta);
      const url = `${base_url}${path}`;

      expect(ds.find((d) => d.rel === "canonical")?.href).toBe(url);
      expect(ds.find((d) => d.property === "og:url")?.content).toBe(url);
      expect(ds.find((d) => d.property === "twitter:url")?.content).toBe(url);
    }
  );

  test.each(pages)(
    "%s is noindex only when it is the 2024 archive",
    (path, meta) => {
      const robots = descriptors(meta).find((d) => d.name === "robots");

      expect(robots?.content).toBe(
        path === "/terms-of-use-npo-2024" ? "noindex" : undefined
      );
    }
  );
});
