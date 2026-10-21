import { describe, expect, test } from "bun:test";
import { openRouterKey } from "./auth.js";

describe("openRouterKey", () => {
  test("reads Bearer from Authorization", () => {
    expect(openRouterKey(new Headers({ Authorization: "Bearer sk-or-v1-abc" }))).toBe("sk-or-v1-abc");
    expect(openRouterKey(new Headers({ Authorization: "bearer  sk-or-v1-abc " }))).toBe("sk-or-v1-abc");
  });

  test("reads X-OpenRouter-Key", () => {
    expect(openRouterKey(new Headers({ "X-OpenRouter-Key": " sk-or-v1-abc " }))).toBe("sk-or-v1-abc");
  });

  test("Authorization takes precedence over X-OpenRouter-Key", () => {
    const headers = new Headers({ Authorization: "Bearer a", "X-OpenRouter-Key": "b" });
    expect(openRouterKey(headers)).toBe("a");
  });

  test("gives null without a key", () => {
    expect(openRouterKey(new Headers())).toBeNull();
    expect(openRouterKey(new Headers({ Authorization: "Basic xyz" }))).toBeNull();
    expect(openRouterKey(new Headers({ "X-OpenRouter-Key": "  " }))).toBeNull();
  });
});
