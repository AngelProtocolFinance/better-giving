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
// @sanity/image-url throws on a ref outside this shape; data written around
// the studio (api token, migration) can hold one.
const ASSET_REF = /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/;

interface IImageRef {
  asset?: { _ref?: unknown } | null;
}
/** the image's url builder, or null when it has no asset ref the builder can parse */
export const urlFor = (source: IImageRef | null | undefined) =>
  typeof source?.asset?._ref === "string" && ASSET_REF.test(source.asset._ref)
    ? builder.image(source as SanityImageSource)
    : null;
