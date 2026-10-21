import { describe, expect, test } from "bun:test";
import { resolveThinking } from "./thinking.js";

const gemini = ["high", "medium", "low"];
const deepseek = ["max", "high", "low", "none"];
const opus = ["max", "xhigh", "high", "medium", "low"];

describe("resolveThinking", () => {
  test("a level that exists is used unchanged", () => {
    expect(resolveThinking("medium", gemini)).toBe("medium");
  });

  test("above the model's highest gives the highest", () => {
    expect(resolveThinking("max", gemini)).toBe("high");
  });

  test("below the model's lowest gives the lowest", () => {
    expect(resolveThinking("minimal", gemini)).toBe("low");
    expect(resolveThinking("none", opus)).toBe("low");
  });

  test("a tie gives the higher one", () => {
    expect(resolveThinking("medium", deepseek)).toBe("high");
  });

  test("no requested level gives nothing", () => {
    expect(resolveThinking(undefined, gemini)).toBeUndefined();
  });

  test("a model without levels gives nothing", () => {
    expect(resolveThinking("high", undefined)).toBeUndefined();
    expect(resolveThinking("high", [])).toBeUndefined();
  });
});
