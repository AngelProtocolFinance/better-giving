import { describe, expect, test } from "vitest";
import { paypal_donor_update, via_name } from "./helpers";

describe("via_name", () => {
  // the label is donor- and nonprofit-visible: it feeds the zapier trigger and
  // the admin donations table, so the employer's gift must not surface as the
  // raw `match` token the funnel keys off
  test("names the employer's own gift", () => {
    expect(via_name("match")).toBe("Employer match");
  });

  test("leaves the neighbouring vias alone", () => {
    expect(via_name("cheque")).toBe("Cheque");
    expect(via_name("daf")).toBe("DAF");
  });
});

describe("paypal_donor_update", () => {
  // paypal is the SECOND writer of these fields: the donor already typed a
  // name and address into the form at intent time, so what this returns is a
  // patch over their entry rather than a record of its own
  test("takes the name without an email to carry it", () => {
    expect(
      paypal_donor_update({ name: { given_name: "Ada", surname: "Lovelace" } })
    ).toEqual({ from_name: "Ada Lovelace" });
  });

  test("leaves the form's name alone when paypal has no name", () => {
    const u = paypal_donor_update({ email_address: "a@b.c" });
    expect(u).toEqual({ from_email: "a@b.c" });
    expect(u).not.toHaveProperty("from_name");
  });

  // the mixed-provenance case: a payer record with only a country would
  // otherwise stamp that country onto the street, city and zip the donor typed
  test("does not touch the address when paypal has no street or city", () => {
    const u = paypal_donor_update({
      email_address: "a@b.c",
      address: { country_code: "GB" },
    });
    expect(u).toEqual({ from_email: "a@b.c" });
  });

  test("replaces the address whole, clearing the parts paypal lacks", () => {
    expect(
      paypal_donor_update({
        address: {
          address_line_1: "12 Fleet St",
          admin_area_2: "London",
          country_code: "GB",
        },
      })
    ).toEqual({
      from_addr_street: "12 Fleet St",
      from_addr_city: "London",
      from_addr_state: "",
      from_addr_zip_code: "",
      from_addr_country: "GB",
    });
  });

  test("joins the two street lines", () => {
    const u = paypal_donor_update({
      address: { address_line_1: "12 Fleet St", address_line_2: "Flat 3" },
    });
    expect(u.from_addr_street).toBe("12 Fleet St Flat 3");
  });

  test("an empty payer is an empty patch", () => {
    expect(paypal_donor_update({})).toEqual({});
  });
});
