import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { render_notice } from "./npo-terms-notice-render";

const rendered = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/emails/rendered"
);
const html_path = join(rendered, "npo-terms-notice.html");
const text_path = join(rendered, "npo-terms-notice.txt");

const count = (value: string, needle: string) => value.split(needle).length - 1;

test("placeholders and the service footer survive rendering", async () => {
  const { html, text, subject, plain_body } = await render_notice();

  assert.equal(
    subject,
    "Updates to the Better Giving Terms for Nonprofits – effective [EFFECTIVE DATE]"
  );
  assert.equal(text, plain_body);

  for (const file of [html, text]) {
    assert.equal(count(file, "{{npo_name}}"), 2);
    assert.ok(file.includes("[EFFECTIVE DATE]"));
    assert.ok(file.includes("[TERMS URL]"));
    assert.ok(file.includes("[SUPPORT EMAIL]"));
    assert.ok(
      file.includes(
        "You are receiving this service notice because you are an administrator of {{npo_name}} on Better Giving. This is a required account notice, not a marketing message."
      )
    );
    assert.ok(
      file.includes(
        "Better Giving, Inc. · 18 Cottekill Rd, Rosendale, NY 12472 · EIN 87-3758939"
      )
    );
  }

  assert.equal(count(text, "[TERMS URL]"), 1);
  assert.equal(count(text, "[SUPPORT EMAIL]"), 1);
  assert.equal(readFileSync(html_path, "utf8"), html);
  assert.equal(readFileSync(text_path, "utf8"), text);
});

test("a filled-in terms url links the archived version to itself", async () => {
  const base_url = "https://better.giving";
  const terms_url = `${base_url}/terms-of-use-npo`;
  const archived = `${base_url}/terms-of-use-npo-2024`;
  const { html } = await render_notice({ base_url, terms_url });

  assert.equal(count(html, `href="${archived}"`), 1);
});
