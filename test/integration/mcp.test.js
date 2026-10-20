import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let nextId = 1;

async function rpc(method, params = {}, extraHeaders = {}) {
  const res = await SELF.fetch("http://example.com/mcp", {
    method: "POST",
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  expect(res.status).toBe(200);
  return parse(res);
}

async function call(name, args, extraHeaders) {
  const body = await rpc("tools/call", { name, arguments: args }, extraHeaders);
  const text = body.result.content[0].text;
  return { isError: body.result.isError ?? false, text, json: body.result.isError ? null : JSON.parse(text) };
}

/** Låter OpenRouter svara med given status och kropp. Svaret skapas per anrop, Workers delar inte I/O mellan requests. */
function mockOpenRouter(status, body) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => env.CACHE.delete("models"));
afterEach(() => vi.restoreAllMocks());

describe("MCP", () => {
  it("svarar på initialize", async () => {
    const body = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(body.result.serverInfo.name).toBe("roundtable");
  });

  it("listar verktygen", async () => {
    const body = await rpc("tools/list");
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["chat", "list_models"]);
  });

  it("andra sökvägar ger 404", async () => {
    const res = await SELF.fetch("http://example.com/annat");
    expect(res.status).toBe(404);
  });
});

describe("list_models", () => {
  const catalog = {
    data: [
      { id: "openai/gpt-6.1-sol", name: "OpenAI: GPT-6.1 Sol", context_length: 400000, created: 1792225624 },
      { id: "openai/gpt-6.1-sol:batch", name: "OpenAI: GPT-6.1 Sol (batch)", context_length: 400000, created: 1792225624 },
      { id: "google/gemini-4-argon", name: "Google: Gemini 4 Argon", context_length: 1048576, created: 1792225624 },
    ],
  };

  it("frågar OpenRouter med filter och returnerar nedbantad lista", async () => {
    const fetch = mockOpenRouter(200, catalog);
    const { json } = await call("list_models", {});
    expect(fetch.mock.calls[0][0]).toContain("model_authors=openai%2Cgoogle%2Canthropic%2Cx-ai%2Cdeepseek");
    expect(json.models.map((m) => m.slug)).toEqual(["openai/gpt-6.1-sol", "google/gemini-4-argon"]);
    expect(json.models[1].context_length).toBe(1048576);
  });

  it("filtrerar på text", async () => {
    mockOpenRouter(200, catalog);
    const { json } = await call("list_models", { filter: "gemini" });
    expect(json.models.map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
  });

  it("hämtar från cachen vid andra anropet", async () => {
    const fetch = mockOpenRouter(200, catalog);
    await call("list_models", {});
    const { json } = await call("list_models", { filter: "gemini" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(json.models.map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
  });

  it("ger isError när OpenRouter svarar med fel", async () => {
    mockOpenRouter(503, {});
    const res = await call("list_models", {});
    expect(res.isError).toBe(true);
    expect(res.text).toContain("503");
  });
});

describe("chat", () => {
  const key = { authorization: "Bearer sk-or-v1-test" };
  const answer = {
    model: "openai/gpt-6.1-sol",
    choices: [{ message: { role: "assistant", content: "Svar från GPT" } }],
    usage: { prompt_tokens: 10, completion_tokens: 4 },
  };

  it("skickar prompten med användarens nyckel och returnerar svaret", async () => {
    const fetch = mockOpenRouter(200, answer);
    const { json } = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hej" }, key);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer sk-or-v1-test");
    expect(JSON.parse(init.body)).toEqual({ model: "openai/gpt-6.1-sol", messages: [{ role: "user", content: "Hej" }] });
    expect(json).toEqual({ model: "openai/gpt-6.1-sol", text: "Svar från GPT", usage: { prompt_tokens: 10, completion_tokens: 4 } });
  });

  it("tar nyckeln från X-OpenRouter-Key", async () => {
    const fetch = mockOpenRouter(200, answer);
    await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hej" }, { "x-openrouter-key": "sk-or-v1-x" });
    expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer sk-or-v1-x");
  });

  it("ger isError utan nyckel och anropar inte OpenRouter", async () => {
    const fetch = mockOpenRouter(200, answer);
    const res = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hej" });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("Ingen OpenRouter-nyckel");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ger isError med OpenRouters felmeddelande", async () => {
    mockOpenRouter(401, { error: { message: "User not found." } });
    const res = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hej" }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toBe("OpenRouter svarade 401: User not found.");
  });

  it("list_models fungerar utan nyckel", async () => {
    mockOpenRouter(200, { data: [] });
    const res = await call("list_models", {});
    expect(res.isError).toBe(false);
  });
});

async function parse(res) {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text.split("\n").find((l) => l.startsWith("data:")).slice(5));
  }
  return JSON.parse(text);
}
