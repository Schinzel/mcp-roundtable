import { describe, expect, it } from "bun:test";
import { FORMAT_INSTRUCTIONS, FORMATS } from "./formats.js";

/** The invariants from docs/formats. Both renderings must carry them, or they drift apart. */
const INVARIANTS = {
  consensus: [
    "own analysis",
    "not count",
    "provider",
    "without continuation_id",
    "confidence 1–10",
    "same option",
    "tenth man",
    "outside the round",
    "second round",
    "Never both",
    "deciding round",
    "thinking medium",
    "Step",
    "one level lower",
  ],
  critic: [
    "goal",
    "three models",
    "focus area",
    "never ask",
    "provider",
    "without continuation_id",
    "critical, major, minor",
    "every finding",
    "accept or reject",
    "rejected",
    "holds up",
    "cost line",
  ],
};

describe("formats", () => {
  it("has exactly consensus and critic", () => {
    expect(Object.keys(FORMATS).sort()).toEqual(["consensus", "critic"]);
  });

  for (const [name, invariants] of Object.entries(INVARIANTS)) {
    it(`${name}: the prompt carries every invariant`, () => {
      const text = FORMATS[name].prompt("x").toLowerCase();
      for (const i of invariants) expect(text).toContain(i.toLowerCase());
    });

    it(`${name}: the server instructions carry every invariant`, () => {
      const start = FORMAT_INSTRUCTIONS.indexOf(`\n${name},`);
      expect(start).toBeGreaterThan(0);
      const end = FORMAT_INSTRUCTIONS.indexOf("\n\n", start + 1);
      const section = (FORMAT_INSTRUCTIONS.slice(start, end) + FORMAT_INSTRUCTIONS.slice(FORMAT_INSTRUCTIONS.indexOf("\nBoth:"))).toLowerCase();
      for (const i of invariants) expect(section).toContain(i.toLowerCase());
    });
  }

  it("the prompt ends with the user's input", () => {
    expect(FORMATS.consensus.prompt("KV or D1?")).toMatch(/The question:\nKV or D1\?$/);
    expect(FORMATS.critic.prompt("the migration")).toMatch(/The subject:\nthe migration$/);
  });

  it("the compact instructions stay compact", () => {
    expect(FORMAT_INSTRUCTIONS.length).toBeLessThan(2000);
  });
});
