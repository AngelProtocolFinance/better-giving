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
export const urlFor = (source: SanityImageSource) => builder.image(source);
