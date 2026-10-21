import { describe, expect, test } from "bun:test";
import { budgetError, composePrompt, estimateTokens, MAX_TURN_CHARS } from "./files.js";

describe("estimateTokens", () => {
  test("characters divided by four, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("composePrompt", () => {
  test("without files it is just the prompt", () => {
    expect(composePrompt("Hi")).toBe("Hi");
    expect(composePrompt("Hi", [])).toBe("Hi");
  });

  test("the files go first, in tags with the path, the prompt last", () => {
    const files = [
      { path: "src/A.java", content: "class A {}" },
      { path: "src/B.java", content: "class B {}" },
    ];
    expect(composePrompt("Review", files)).toBe(
      '<file path="src/A.java">\nclass A {}\n</file>\n\n<file path="src/B.java">\nclass B {}\n</file>\n\nReview',
    );
  });
});

describe("budgetError", () => {
  const turn = (prompt, files, history = [], contextLength = 1000) => ({
    model: "openai/gpt-6.1-sol",
    contextLength,
    prompt,
    composed: composePrompt(prompt, files),
    history,
    continued: history.length > 0,
  });

  test("null when the turn fits", () => {
    expect(budgetError(turn("Hi", [{ path: "A.java", content: "x".repeat(2000) }]))).toBeNull();
  });

  test("too large gives numbers per part and the limit", () => {
    const history = [{ content: "h".repeat(400) }, { content: "s".repeat(400) }];
    const message = budgetError(turn("p".repeat(40), [{ path: "A.java", content: "x".repeat(2800) }], history));
    expect(message).toBe(
      "Too large for openai/gpt-6.1-sol: about 918 tokens (files 708, history 200, prompt 10), " +
        "limit 750 (75% of the 1,000 token context window). " +
        "Send fewer or smaller files, or leave continuation_id out to start a new conversation.",
    );
  });

  test("a new conversation does not suggest dropping continuation_id", () => {
    const message = budgetError(turn("Hi", [{ path: "A.java", content: "x".repeat(4000) }]));
    expect(message).toEndWith("Send fewer or smaller files.");
  });

  test("an unknown context window skips the budget", () => {
    expect(budgetError(turn("Hi", [{ path: "A.java", content: "x".repeat(4000) }], [], null))).toBeNull();
  });

  test("too many characters for D1 gives an error even with an unknown context window", () => {
    const message = budgetError(turn("Hi", [{ path: "A.java", content: "x".repeat(MAX_TURN_CHARS) }], [], null));
    expect(message).toStartWith("Too large to store:");
  });
});
