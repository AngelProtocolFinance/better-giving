import { beforeEach, describe, expect, it, vi } from "vitest";

const get_payment_mock = vi.hoisted(() => vi.fn());
const estimate_mock = vi.hoisted(() => vi.fn());
const get_session_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/nowpayments", () => ({
  np: { find_payment: get_payment_mock, estimate: estimate_mock },
}));
vi.mock("#/.server/auth", () => ({ get_session: get_session_mock }));
vi.mock("$/pg/queries/donation", () => ({ donation_get: donation_get_mock }));

const { loader } = await import("./route");
const { donations_cookie } = await import("#/.server/cookie");

const ORDER_ID = "0b6f7a52-2f7e-4f7b-9d7a-6b3c2f0f1a11";
const OWNER = "donor@test.com";

const cookie_for = async (id: string, expiry = Date.now() + 60_000) =>
  (await donations_cookie.serialize({ [id]: expiry })).split(";")[0];

const load = async (cookie?: string, id = "777") => {
  const request = new Request(`https://x/api/crypto-intents/${id}`, {
    headers: cookie ? { cookie } : {},
  });
  try {
    return await loader({ request, params: { id } } as any);
  } catch (thrown) {
    return thrown;
  }
};
const status_of = (r: unknown) => (r instanceof Response ? r.status : 200);

beforeEach(() => {
  vi.clearAllMocks();
  get_session_mock.mockResolvedValue({ user: undefined });
  get_payment_mock.mockResolvedValue({
    payment_id: 777,
    order_id: ORDER_ID,
    payment_status: "waiting",
    pay_address: "0xdeposit",
    pay_amount: 0.01,
    pay_currency: "eth",
    order_description: "NP Test NPO",
  });
  estimate_mock.mockResolvedValue({ usdpu: 2000 });
  donation_get_mock.mockResolvedValue({
    id: ORDER_ID,
    from_email: OWNER,
    status: "intent",
    currency: "ETH",
    amount: { base: 0.01, tip: 0, fee_allowance: 0 },
    upusd: 1 / 2000,
    to_name: "NP Test NPO",
  });
});

describe("api.crypto-intents numeric id", () => {
  it("without the donation cookie or a session is a 404, before nowpayments", async () => {
    const res = await load();
    expect(status_of(res)).toBe(404);
    expect(get_payment_mock).not.toHaveBeenCalled();
  });

  it("the donation cookie for another order is a 404", async () => {
    const res = await load(await cookie_for("some-other-donation"));
    expect(status_of(res)).toBe(404);
  });

  it("an expired cookie entry for the order is a 404", async () => {
    const res = await load(await cookie_for(ORDER_ID, Date.now() - 1));
    expect(status_of(res)).toBe(404);
  });

  it("the donation cookie for the payment's order returns the payment", async () => {
    const res = await load(await cookie_for(ORDER_ID));
    expect(res).toMatchObject({
      id: 777,
      order_id: ORDER_ID,
      address: "0xdeposit",
      currency: "ETH",
      usdpu: 2000,
    });
  });

  it("a resumed memo-tag payment carries its memo, so the deposit can be attributed", async () => {
    get_payment_mock.mockResolvedValue({
      payment_id: 777,
      order_id: ORDER_ID,
      payment_status: "waiting",
      pay_address: "rDeposit",
      payin_extra_id: "2718281828",
      pay_amount: 12.5,
      pay_currency: "xrp",
      order_description: "NP Test NPO",
    });
    const res = await load(await cookie_for(ORDER_ID));
    expect(res).toMatchObject({
      address: "rDeposit",
      extra_address: "2718281828",
      currency: "XRP",
    });
  });

  it("a signed-in donor who owns the donation gets the payment from any device", async () => {
    get_session_mock.mockResolvedValue({ user: { email: OWNER } });
    const res = await load();
    expect(res).toMatchObject({ id: 777, order_id: ORDER_ID });
  });

  it("the owner's email matches whatever case either side was typed in", async () => {
    get_session_mock.mockResolvedValue({ user: { email: "Donor@Test.com" } });
    donation_get_mock.mockResolvedValue({
      id: ORDER_ID,
      from_email: "DONOR@test.com",
    });
    const res = await load();
    expect(res).toMatchObject({ id: 777, order_id: ORDER_ID });
  });

  it("a signed-in user who doesn't own the donation is a 404", async () => {
    get_session_mock.mockResolvedValue({ user: { email: "other@test.com" } });
    const res = await load();
    expect(status_of(res)).toBe(404);
  });

  it("a payment id nowpayments doesn't know is a 404", async () => {
    get_payment_mock.mockResolvedValue(null);
    const res = await load(await cookie_for(ORDER_ID));
    expect(status_of(res)).toBe(404);
  });

  it("a nowpayments outage stays an error", async () => {
    const outage = new Error("nowpayments v1/payment/777 503");
    get_payment_mock.mockRejectedValue(outage);
    const res = await load(await cookie_for(ORDER_ID));
    expect(res).toBe(outage);
  });
});

describe("api.crypto-intents donation id", () => {
  it("without the donation cookie or a session is a 404, before the db", async () => {
    const res = await load(undefined, ORDER_ID);
    expect(status_of(res)).toBe(404);
    expect(donation_get_mock).not.toHaveBeenCalled();
  });

  it("the donation cookie for another donation is a 404", async () => {
    const res = await load(await cookie_for("some-other-donation"), ORDER_ID);
    expect(status_of(res)).toBe(404);
  });

  it("the donation cookie for that donation returns the deposit", async () => {
    const res = await load(await cookie_for(ORDER_ID), ORDER_ID);
    expect(status_of(res)).toBe(200);
    expect(await (res as Response).json()).toMatchObject({
      id: ORDER_ID,
      currency: "ETH",
      amount: 0.01,
    });
  });

  it("a signed-in donor who owns the donation gets the deposit", async () => {
    get_session_mock.mockResolvedValue({ user: { email: OWNER } });
    const res = await load(undefined, ORDER_ID);
    expect(status_of(res)).toBe(200);
  });

  it("a signed-in user who doesn't own it is a 404, not its status", async () => {
    get_session_mock.mockResolvedValue({ user: { email: "other@test.com" } });
    donation_get_mock.mockResolvedValue({
      id: ORDER_ID,
      from_email: OWNER,
      status: "settled",
    });
    const res = await load(undefined, ORDER_ID);
    expect(status_of(res)).toBe(404);
  });
});
