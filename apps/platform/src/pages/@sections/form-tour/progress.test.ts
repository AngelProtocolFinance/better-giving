import { describe, expect, test } from "vitest";
import { frame_of, METHODS, step_at, tour_pos } from "./progress";

// four chapters stacked from y=100, each 500px tall, as the viewport reads them
const boxes = [0, 1, 2, 3].map((i) => ({ top: 100 + i * 500, height: 500 }));

describe("tour_pos", () => {
  test("before the first chapter reaches the anchor, the tour rests on chapter 0", () => {
    expect(tour_pos(boxes, 50)).toEqual({ chapter: 0, progress: 0 });
  });

  test("the chapter is the last one whose top has passed the anchor", () => {
    expect(tour_pos(boxes, 600)).toEqual({ chapter: 1, progress: 0 });
    expect(tour_pos(boxes, 725)).toEqual({ chapter: 1, progress: 0.25 });
    expect(tour_pos(boxes, 1099)).toMatchObject({ chapter: 1 });
  });

  test("past the last chapter the tour holds its end", () => {
    expect(tour_pos(boxes, 5000)).toEqual({ chapter: 3, progress: 1 });
  });

  test("no chapters measured yet reads as the server's frame", () => {
    expect(tour_pos([], 400)).toEqual({ chapter: 0, progress: 0 });
  });
});

describe("chapter 1 scrubs the method tabs", () => {
  const method = (progress: number) =>
    frame_of({ chapter: 1, progress }).method;

  test("from the first tab, through the middle, to the last", () => {
    expect(method(0)).toBe("stripe");
    expect(method(0.5)).toBe(METHODS[3]);
    expect(method(1)).toBe("crypto");
  });

  test("every tab gets an equal share of the chapter", () => {
    const seen = [0.05, 0.2, 0.36, 0.53, 0.7, 0.86].map(method);
    expect(seen).toEqual([...METHODS]);
  });

  test("step_at never runs past the last step", () => {
    expect(step_at(0, 3)).toBe(0);
    expect(step_at(0.999, 3)).toBe(2);
    expect(step_at(1, 3)).toBe(2);
  });
});

describe("frame_of", () => {
  test("chapter 0 is the production screenshot's state", () => {
    expect(frame_of({ chapter: 0, progress: 0.7 })).toEqual({
      view: "form",
      method: "stripe",
      frequency: "one-time",
      amount: "10",
      accent: 0,
      tip: "hidden",
      express: true,
      pose: "gift",
    });
  });

  test("the gift turns monthly as the tour leaves the hero", () => {
    expect(frame_of({ chapter: 1, progress: 0 }).frequency).toBe("monthly");
  });

  test("brandable cycles three accents, brand first", () => {
    const accent = (progress: number) =>
      frame_of({ chapter: 2, progress }).accent;
    expect([accent(0), accent(0.5), accent(1)]).toEqual([0, 1, 2]);
  });

  test("the contribution shows starting off, then switches on", () => {
    expect(frame_of({ chapter: 3, progress: 0.2 }).tip).toBe("off");
    expect(frame_of({ chapter: 3, progress: 0.8 }).tip).toBe("on");
  });

  test("the tour ends on the thank-you, Laira cheering", () => {
    expect(frame_of({ chapter: 4, progress: 0 })).toMatchObject({
      view: "thanks",
      frequency: "monthly",
      pose: "cheering",
    });
  });
});
