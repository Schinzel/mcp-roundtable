import { describe, expect, test } from "bun:test";
import { buildChatRequest, chatErrorMessage, parseChatResponse } from "./chat.js";

describe("buildChatRequest", () => {
  test("sends the prompt as a user message", () => {
    expect(buildChatRequest("openai/gpt-6.1-sol", "Hi")).toEqual({
      model: "openai/gpt-6.1-sol",
      messages: [{ role: "user", content: "Hi" }],
      reasoning: { exclude: true },
    });
  });

  test("sends effort when a level is chosen", () => {
    expect(buildChatRequest("openai/gpt-6.1-sol", "Hi", [], "high").reasoning).toEqual({ effort: "high", exclude: true });
  });

  test("places earlier turns before the prompt", () => {
    const history = [
      { role: "user", content: "Question" },
      { role: "assistant", content: "Answer" },
    ];
    expect(buildChatRequest("openai/gpt-6.1-sol", "Follow-up", history).messages).toEqual([
      ...history,
      { role: "user", content: "Follow-up" },
    ]);
  });
});

describe("parseChatResponse", () => {
  const body = {
    model: "openai/gpt-6.1-sol",
    choices: [{ message: { role: "assistant", content: "Answer" } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
  };

  test("returns text, model and token usage", () => {
    expect(parseChatResponse(body)).toEqual({
      model: "openai/gpt-6.1-sol",
      text: "Answer",
      usage: { prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.0001 },
    });
  });

  test("returns reasoning_tokens when OpenRouter sends them", () => {
    const usage = { prompt_tokens: 10, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 40 } };
    expect(parseChatResponse({ ...body, usage }).usage).toEqual({ prompt_tokens: 10, completion_tokens: 50, reasoning_tokens: 40 });
  });

  test("leaves out cost_usd when OpenRouter does not send it", () => {
    const { usage } = parseChatResponse({ ...body, usage: { prompt_tokens: 1, completion_tokens: 2 } });
    expect(usage).toEqual({ prompt_tokens: 1, completion_tokens: 2 });
  });

  test("an error in the body becomes an exception", () => {
    expect(() => parseChatResponse({ error: { message: "Model not found" } })).toThrow("OpenRouter: Model not found");
  });

  test("a response without text becomes an exception", () => {
    expect(() => parseChatResponse({ choices: [] })).toThrow("no text");
  });
});

describe("chatErrorMessage", () => {
  test("uses OpenRouter's error message", () => {
    expect(chatErrorMessage(401, '{"error":{"message":"No auth credentials found"}}')).toBe(
      "OpenRouter returned 401: No auth credentials found",
    );
  });

  test("402 says the account is out of credits and keeps OpenRouter's message", () => {
    const message = chatErrorMessage(402, '{"error":{"code":402,"message":"Insufficient credits"}}');
    expect(message).toStartWith("Your OpenRouter account or key is out of credits.");
    expect(message).toContain("continuation_id still works");
    expect(message).toEndWith("OpenRouter said: Insufficient credits");
  });

  test("403 from the key's limit says the key is out of credits", () => {
    const body = '{"error":{"code":403,"message":"Key limit exceeded","metadata":{"limit_source":"openrouter_key_limit"}}}';
    expect(chatErrorMessage(403, body)).toStartWith("Your OpenRouter account or key is out of credits.");
  });

  test("other 403 errors keep OpenRouter's message", () => {
    expect(chatErrorMessage(403, '{"error":{"code":403,"message":"Flagged by moderation"}}')).toBe(
      "OpenRouter returned 403: Flagged by moderation",
    );
  });

  test("handles a body that is not JSON", () => {
    expect(chatErrorMessage(502, "Bad gateway")).toBe("OpenRouter returned 502: Bad gateway");
  });
});
