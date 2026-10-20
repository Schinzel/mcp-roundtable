import { describe, expect, test } from "bun:test";
import { buildChatRequest, chatErrorMessage, parseChatResponse } from "./chat.js";

describe("buildChatRequest", () => {
  test("skickar prompten som ett user-meddelande", () => {
    expect(buildChatRequest("openai/gpt-6.1-sol", "Hej")).toEqual({
      model: "openai/gpt-6.1-sol",
      messages: [{ role: "user", content: "Hej" }],
    });
  });

  test("lägger tidigare rundor före prompten", () => {
    const history = [
      { role: "user", content: "Fråga" },
      { role: "assistant", content: "Svar" },
    ];
    expect(buildChatRequest("openai/gpt-6.1-sol", "Följdfråga", history).messages).toEqual([
      ...history,
      { role: "user", content: "Följdfråga" },
    ]);
  });
});

describe("parseChatResponse", () => {
  const body = {
    model: "openai/gpt-6.1-sol",
    choices: [{ message: { role: "assistant", content: "Svar" } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
  };

  test("returnerar text, modell och tokenåtgång", () => {
    expect(parseChatResponse(body)).toEqual({
      model: "openai/gpt-6.1-sol",
      text: "Svar",
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
    });
  });

  test("utelämnar cost när OpenRouter inte skickar den", () => {
    const { usage } = parseChatResponse({ ...body, usage: { prompt_tokens: 1, completion_tokens: 2 } });
    expect(usage).toEqual({ prompt_tokens: 1, completion_tokens: 2 });
  });

  test("fel i kroppen blir undantag", () => {
    expect(() => parseChatResponse({ error: { message: "Model not found" } })).toThrow("OpenRouter: Model not found");
  });

  test("svar utan text blir undantag", () => {
    expect(() => parseChatResponse({ choices: [] })).toThrow("no text");
  });
});

describe("chatErrorMessage", () => {
  test("använder OpenRouters felmeddelande", () => {
    expect(chatErrorMessage(401, '{"error":{"message":"No auth credentials found"}}')).toBe(
      "OpenRouter returned 401: No auth credentials found",
    );
  });

  test("klarar kropp som inte är JSON", () => {
    expect(chatErrorMessage(502, "Bad gateway")).toBe("OpenRouter returned 502: Bad gateway");
  });
});
