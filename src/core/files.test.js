import { describe, expect, test } from "bun:test";
import { budgetError, composePrompt, estimateTokens, MAX_TURN_CHARS } from "./files.js";

describe("estimateTokens", () => {
  test("tecken delat med fyra, avrundat uppåt", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("composePrompt", () => {
  test("utan filer blir det bara prompten", () => {
    expect(composePrompt("Hej")).toBe("Hej");
    expect(composePrompt("Hej", [])).toBe("Hej");
  });

  test("filerna går först, i taggar med sökvägen, prompten sist", () => {
    const files = [
      { path: "src/A.java", content: "class A {}" },
      { path: "src/B.java", content: "class B {}" },
    ];
    expect(composePrompt("Granska", files)).toBe(
      '<file path="src/A.java">\nclass A {}\n</file>\n\n<file path="src/B.java">\nclass B {}\n</file>\n\nGranska',
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

  test("null när rundan får plats", () => {
    expect(budgetError(turn("Hej", [{ path: "A.java", content: "x".repeat(2000) }]))).toBeNull();
  });

  test("för stort ger siffror per del och gränsen", () => {
    const history = [{ content: "h".repeat(400) }, { content: "s".repeat(400) }];
    const message = budgetError(turn("p".repeat(40), [{ path: "A.java", content: "x".repeat(2800) }], history));
    expect(message).toBe(
      "Too large for openai/gpt-6.1-sol: about 918 tokens (files 708, history 200, prompt 10), " +
        "limit 750 (75% of the 1,000 token context window). " +
        "Send fewer or smaller files, or leave continuation_id out to start a new conversation.",
    );
  });

  test("ny konversation föreslår inte att släppa continuation_id", () => {
    const message = budgetError(turn("Hej", [{ path: "A.java", content: "x".repeat(4000) }]));
    expect(message).toEndWith("Send fewer or smaller files.");
  });

  test("okänt kontextfönster hoppar över budgeten", () => {
    expect(budgetError(turn("Hej", [{ path: "A.java", content: "x".repeat(4000) }], [], null))).toBeNull();
  });

  test("för många tecken för D1 ger fel även med okänt kontextfönster", () => {
    const message = budgetError(turn("Hej", [{ path: "A.java", content: "x".repeat(MAX_TURN_CHARS) }], [], null));
    expect(message).toStartWith("Too large to store:");
  });
});
