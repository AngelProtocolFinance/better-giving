import { put } from "@vercel/blob";
import { type ActionFunction, data } from "react-router";
import { nonEmpty, pipe, safeParse, string } from "valibot";
import { resp, search } from "@/helpers/https";
import { blob as blob_env } from "$/env";

export const action: ActionFunction = async ({ request }) => {
  const { filename } = search(request);
  const p = safeParse(pipe(string(), nonEmpty()), filename);
  if (p.issues) return resp.status(400, p.issues[0].message);

  const file = await request.blob();
  const blob = await put(p.output, file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blob_env.read_write_token,
  });

  return data({ url: blob.url });
};
