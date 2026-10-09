import { donation_tribute_notif as dtn } from "emails";
import { render } from "react-email";
import { describe, expect, test } from "vitest";

const data: dtn.IData = {
  in_honor_of: "Rose Alvarez",
  notif_to_full_name: "Mary Johnson",
  from: { first_name: "Jane", full_name: "Jane Doe" },
  to_name: "Save The Rainforest Foundation",
  amount: { value: 100, currency: "USD", value_usd: 100 },
  from_msg: "",
};

describe("tribute notification mail", () => {
  test("names the honoree in the body when the donor left no message", async () => {
    const { node } = dtn.template(data);
    // react separates adjacent text nodes with `<!-- -->`
    const html = (await render(node)).replaceAll("<!-- -->", "");
    const text = await render(node, { plainText: true });

    expect(html).toMatch(/in honor of\s+Rose Alvarez/);
    expect(text).toMatch(/in honor of\s+Rose Alvarez/);
  });
});
