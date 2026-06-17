import { createClient } from "@sanity/client";
import {
  createImageUrlBuilder,
  type SanityImageSource,
} from "@sanity/image-url";

export const sanity = createClient({
  projectId: "5820hdyj",
  dataset: "production",
  apiVersion: "2026-06-18",
  useCdn: true,
});

const builder = createImageUrlBuilder({
  projectId: "5820hdyj",
  dataset: "production",
});
export const urlFor = (source: SanityImageSource) => builder.image(source);
