import { describe, expect, test } from "vitest";
import { id_param_to_num } from "../id-param-to-num";

describe("id param to number", () => {
  test("user set id path to invalid", () => {
    //user types to url invalid
    expect(id_param_to_num()).toBe(0); //0 is AP_ID
    expect(id_param_to_num("abcde")).toBe(0);
    expect(id_param_to_num("1.123")).toBe(1);
    expect(id_param_to_num("2.6123")).toBe(2);
  });
  test("valid string numbers", () => {
    expect(id_param_to_num("10")).toBe(10);
    expect(id_param_to_num("100")).toBe(100);
  });
});
