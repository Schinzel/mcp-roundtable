import { describe, expect, test } from "bun:test";
import { greeting } from "./hello.js";

describe("greeting", () => {
  test("hälsar med namn", () => {
    expect(greeting("Henrik")).toBe("Hej Henrik, roundtable svarar.");
  });

  test("hälsar utan namn", () => {
    expect(greeting()).toBe("Hej du, roundtable svarar.");
    expect(greeting("  ")).toBe("Hej du, roundtable svarar.");
  });
});
