import type { LoaderFunction } from "react-router";
import guide from "../../public/llm.txt?raw";

export const loader: LoaderFunction = () => {
  return new Response(guide, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
};
