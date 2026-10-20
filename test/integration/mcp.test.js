import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let nextId = 1;

async function rpc(method, params = {}) {
  const res = await SELF.fetch("http://example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  expect(res.status).toBe(200);
  return parse(res);
}

async function call(name, args) {
  const body = await rpc("tools/call", { name, arguments: args });
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
    expect(body.result.tools.map((t) => t.name)).toEqual(["list_models"]);
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

async function parse(res) {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text.split("\n").find((l) => l.startsWith("data:")).slice(5));
  }
  return JSON.parse(text);
}
