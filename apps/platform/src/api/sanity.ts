import { createClient } from "@sanity/client";
import {
  createImageUrlBuilder,
  type SanityImageSource,
} from "@sanity/image-url";
import { DATASET, PROJECT_ID } from "blog-types";

export const sanity = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: "2026-06-18",
  useCdn: true,
});

const builder = createImageUrlBuilder({
  projectId: PROJECT_ID,
  dataset: DATASET,
});
// a sanity image asset id. the builder throws at .url() on some refs outside
// this shape and builds a dead url from others; a write made around the studio
// (api token, migration) can store either.
const ASSET_REF = /^image-[A-Za-z0-9_]+-\d+x\d+-[a-z0-9]+$/;

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
/** absent, or every listed field a finite number: the builder fills in a
 * missing crop/hotspot but not a missing field, which yields `rect=NaN` */
const numeric = (v: unknown, fields: string[]) =>
  !v ||
  (typeof v === "object" &&
    fields.every((f) => finite((v as Record<string, unknown>)[f])));

interface IImageRef {
  asset?: { _ref?: unknown } | null;
  crop?: unknown;
  hotspot?: unknown;
}
/** the image's url builder, or null when the builder can't make a working url from it */
export const urlFor = (source: IImageRef | null | undefined) =>
  typeof source?.asset?._ref === "string" &&
  ASSET_REF.test(source.asset._ref) &&
  numeric(source.crop, ["top", "bottom", "left", "right"]) &&
  numeric(source.hotspot, ["x", "y", "width", "height"])
    ? builder.image(source as SanityImageSource)
    : null;
