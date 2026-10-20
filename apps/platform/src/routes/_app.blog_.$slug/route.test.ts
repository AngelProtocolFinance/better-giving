import { POST_QUERY } from "blog-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetch = vi.hoisted(() => vi.fn());

vi.mock("#/api/sanity", () => ({ sanity: { fetch }, urlFor: vi.fn() }));

import { loader, updated_more_than_a_day_later } from "./route";

const OLD = "Fundraising-Platform Lawsuits";
const CLEAN = "fundraising-platform-lawsuits";

const load = (slug: string) => loader({ params: { slug } } as never);

beforeEach(() => {
  fetch.mockReset();
});

describe("blog slug rename", () => {
  it("serves the old slug when the clean slug is missing", async () => {
    const post = { title: "Lawsuits", slug: { current: OLD } };
    fetch.mockImplementation(
      async (_query: string, params: { slug: string }) =>
        params.slug === OLD ? post : null
    );

    const res = await load(OLD);

    expect(res).toBe(post);
    expect(fetch.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [POST_QUERY, { slug: CLEAN }],
      [POST_QUERY, { slug: OLD }],
    ]);
  });

  it("301s the old slug to the clean path once that post exists", async () => {
    const post = { title: "Lawsuits", slug: { current: CLEAN } };
    fetch.mockImplementation(
      async (_query: string, params: { slug: string }) =>
        params.slug === CLEAN ? post : null
    );

    const res = await load(OLD);

    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "/blog/fundraising-platform-lawsuits"
    );
    expect(fetch.mock.calls.map((call) => call[1])).toEqual([{ slug: CLEAN }]);
  });

  it("returns the clean slug's post without redirecting", async () => {
    const post = { title: "Lawsuits", slug: { current: CLEAN } };
    fetch.mockResolvedValue(post);

    const res = await load(CLEAN);

    expect(res).toBe(post);
    expect(fetch.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [POST_QUERY, { slug: CLEAN }],
    ]);
  });
});

const published = "2026-06-15T08:00:00.000Z";
const later = (hours: number) =>
  new Date(Date.parse(published) + hours * 60 * 60 * 1000).toISOString();

describe("updated date", () => {
  it("is false on the same day", () => {
    expect(updated_more_than_a_day_later(published, later(10))).toBe(false);
  });

  it("is false 23 hours later", () => {
    expect(updated_more_than_a_day_later(published, later(23))).toBe(false);
  });

  it("is true 25 hours later", () => {
    expect(updated_more_than_a_day_later(published, later(25))).toBe(true);
  });

  it("is false when the updated date is missing", () => {
    expect(updated_more_than_a_day_later(published, undefined)).toBe(false);
  });
});
