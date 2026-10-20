import { describe, expect, test } from "bun:test";
import { openRouterKey } from "./auth.js";

describe("openRouterKey", () => {
  test("läser Bearer från Authorization", () => {
    expect(openRouterKey(new Headers({ Authorization: "Bearer sk-or-v1-abc" }))).toBe("sk-or-v1-abc");
    expect(openRouterKey(new Headers({ Authorization: "bearer  sk-or-v1-abc " }))).toBe("sk-or-v1-abc");
  });

  test("läser X-OpenRouter-Key", () => {
    expect(openRouterKey(new Headers({ "X-OpenRouter-Key": " sk-or-v1-abc " }))).toBe("sk-or-v1-abc");
  });

  test("Authorization går före X-OpenRouter-Key", () => {
    const headers = new Headers({ Authorization: "Bearer a", "X-OpenRouter-Key": "b" });
    expect(openRouterKey(headers)).toBe("a");
  });

  test("ger null utan nyckel", () => {
    expect(openRouterKey(new Headers())).toBeNull();
    expect(openRouterKey(new Headers({ Authorization: "Basic xyz" }))).toBeNull();
    expect(openRouterKey(new Headers({ "X-OpenRouter-Key": "  " }))).toBeNull();
  });
});
