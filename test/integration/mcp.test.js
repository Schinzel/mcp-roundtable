import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveTurn } from "../../src/store.js";

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

/** Lets OpenRouter answer with the given status and body. The response is created per call, Workers do not share I/O between requests. */
function mockOpenRouter(status, body) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => env.CACHE.delete("models-v2"));

/** Puts the model list in KV, so chat does not fetch /models and fetch only sees OpenRouter's chat calls. */
const seedModels = () =>
  env.CACHE.put(
    "models-v2",
    JSON.stringify([
      { slug: "openai/gpt-6.1-sol", name: "OpenAI: GPT-6.1 Sol", context_length: 1000, added: "2026-10-15" },
      {
        slug: "google/gemini-4-argon",
        name: "Google: Gemini 4 Argon",
        context_length: 1048576,
        added: "2026-10-13",
        thinking: ["high", "medium", "low"],
        default_thinking: "medium",
      },
    ]),
  );
afterEach(() => vi.restoreAllMocks());

describe("MCP", () => {
  it("answers initialize", async () => {
    const body = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(body.result.serverInfo.name).toBe("roundtable");
    expect(body.result.instructions).toContain("Start with a table that defines every option");
    expect(body.result.instructions).toContain("End the report with one line of cost");
  });

  it("lists the tools", async () => {
    const body = await rpc("tools/list");
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["chat", "list_models", "version"]);
  });

  it("gives the version from package.json in initialize, /version, list_models and the version tool", async () => {
    const { version } = (await import("../../package.json", { with: { type: "json" } })).default;
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.result.serverInfo.version).toBe(version);
    expect(await (await SELF.fetch("http://example.com/version")).json()).toEqual({ version });
    mockOpenRouter(200, { data: [] });
    expect((await call("list_models", {})).json.server_version).toBe(version);
    expect((await call("version", {})).json).toEqual({ version });
  });

  it("other paths give 404", async () => {
    const res = await SELF.fetch("http://example.com/other");
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

  it("asks OpenRouter with a filter and returns a trimmed list", async () => {
    const fetch = mockOpenRouter(200, catalog);
    const { json } = await call("list_models", {});
    expect(fetch.mock.calls[0][0]).toContain("model_authors=openai%2Cgoogle%2Canthropic%2Cx-ai%2Cdeepseek");
    expect(json.models.map((m) => m.slug)).toEqual(["openai/gpt-6.1-sol", "google/gemini-4-argon"]);
    expect(json.models[1].context_length).toBe(1048576);
  });

  it("filters on text", async () => {
    mockOpenRouter(200, catalog);
    const { json } = await call("list_models", { filter: "gemini" });
    expect(json.models.map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
  });

  it("reads from the cache on the second call", async () => {
    const fetch = mockOpenRouter(200, catalog);
    await call("list_models", {});
    const { json } = await call("list_models", { filter: "gemini" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(json.models.map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
  });

  it("gives isError when OpenRouter answers with an error", async () => {
    mockOpenRouter(503, {});
    const res = await call("list_models", {});
    expect(res.isError).toBe(true);
    expect(res.text).toContain("503");
  });
});

describe("chat", () => {
  beforeEach(seedModels);
  const key = { authorization: "Bearer sk-or-v1-test" };
  const answer = {
    model: "openai/gpt-6.1-sol",
    choices: [{ message: { role: "assistant", content: "Answer from GPT" } }],
    usage: { prompt_tokens: 10, completion_tokens: 4 },
  };

  it("sends the prompt with the user's key and returns the answer", async () => {
    const fetch = mockOpenRouter(200, answer);
    const { json } = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hi" }, key);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer sk-or-v1-test");
    expect(JSON.parse(init.body)).toEqual({
      model: "openai/gpt-6.1-sol",
      messages: [{ role: "user", content: "Hi" }],
      reasoning: { exclude: true },
    });
    expect(json).toEqual({
      model: "openai/gpt-6.1-sol",
      text: "Answer from GPT",
      usage: { prompt_tokens: 10, completion_tokens: 4 },
      continuation_id: expect.any(String),
    });
  });

  it("takes the key from X-OpenRouter-Key", async () => {
    const fetch = mockOpenRouter(200, answer);
    await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hi" }, { "x-openrouter-key": "sk-or-v1-x" });
    expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer sk-or-v1-x");
  });

  it("gives isError without a key and does not call OpenRouter", async () => {
    const fetch = mockOpenRouter(200, answer);
    const res = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hi" });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("No OpenRouter key");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives isError with OpenRouter's error message", async () => {
    mockOpenRouter(401, { error: { message: "User not found." } });
    const res = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hi" }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toBe("OpenRouter returned 401: User not found.");
  });

  it("thinking the model lacks becomes the nearest level and shows in the answer", async () => {
    const fetch = mockOpenRouter(200, { ...answer, model: "google/gemini-4-argon" });
    const { json } = await call("chat", { model: "google/gemini-4-argon", prompt: "Hi", thinking: "max" }, key);
    expect(JSON.parse(fetch.mock.calls[0][1].body).reasoning).toEqual({ effort: "high", exclude: true });
    expect(json.thinking).toBe("high");
  });

  it("saves usage, cost and thinking level on the answer", async () => {
    const usage = { prompt_tokens: 10, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 40 }, cost: 0.0012 };
    mockOpenRouter(200, { ...answer, model: "google/gemini-4-argon", usage });
    const { json } = await call("chat", { model: "google/gemini-4-argon", prompt: "Hi", thinking: "high" }, key);
    const rows = await env.DB.prepare(
      "SELECT role, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, thinking FROM message WHERE conversation_id = ? ORDER BY id",
    )
      .bind(json.continuation_id)
      .all();
    expect(rows.results).toEqual([
      { role: "user", prompt_tokens: null, completion_tokens: null, reasoning_tokens: null, cost_usd: null, thinking: null },
      { role: "assistant", prompt_tokens: 10, completion_tokens: 50, reasoning_tokens: 40, cost_usd: 0.0012, thinking: "high" },
    ]);
  });

  it("thinking is ignored for a model without levels", async () => {
    const fetch = mockOpenRouter(200, answer);
    const { json } = await call("chat", { model: "openai/gpt-6.1-sol", prompt: "Hi", thinking: "high" }, key);
    expect(JSON.parse(fetch.mock.calls[0][1].body).reasoning).toEqual({ exclude: true });
    expect(json).not.toHaveProperty("thinking");
  });

  it("an unknown thinking level gives an error without a call to OpenRouter", async () => {
    const fetch = mockOpenRouter(200, answer);
    const body = await rpc("tools/call", { name: "chat", arguments: { model: "openai/gpt-6.1-sol", prompt: "Hi", thinking: "huge" } }, key);
    expect(body.error ?? body.result.isError).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("list_models works without a key", async () => {
    mockOpenRouter(200, { data: [] });
    const res = await call("list_models", {});
    expect(res.isError).toBe(false);
  });
});

describe("chat with continuation_id", () => {
  beforeEach(seedModels);
  const key = { authorization: "Bearer sk-or-v1-test" };
  const model = "openai/gpt-6.1-sol";

  /** OpenRouter answers "Answer 1", "Answer 2" ... in order. */
  function mockAnswers() {
    let n = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n++;
      return new Response(JSON.stringify({ model, choices: [{ message: { content: `Answer ${n}` } }], usage: {} }));
    });
  }

  const sentMessages = (fetch, i) => JSON.parse(fetch.mock.calls[i][1].body).messages;

  it("three turns where the model sees the whole conversation", async () => {
    const fetch = mockAnswers();
    const first = await call("chat", { model, prompt: "Question 1" }, key);
    const id = first.json.continuation_id;
    const second = await call("chat", { model, prompt: "Question 2", continuation_id: id }, key);
    const third = await call("chat", { model, prompt: "Question 3", continuation_id: id }, key);
    expect(second.json.continuation_id).toBe(id);
    expect(third.json.text).toBe("Answer 3");
    expect(sentMessages(fetch, 2)).toEqual([
      { role: "user", content: "Question 1" },
      { role: "assistant", content: "Answer 1" },
      { role: "user", content: "Question 2" },
      { role: "assistant", content: "Answer 2" },
      { role: "user", content: "Question 3" },
    ]);
  });

  it("stores a hash of the key, not the key", async () => {
    mockAnswers();
    const { json } = await call("chat", { model, prompt: "Hi" }, key);
    const row = await env.DB.prepare("SELECT key_hash FROM conversation WHERE id = ?").bind(json.continuation_id).first();
    expect(row.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.key_hash).not.toContain("sk-or");
  });

  it("a wrong key gives the same error as an unknown id and does not call OpenRouter", async () => {
    const fetch = mockAnswers();
    const { json } = await call("chat", { model, prompt: "Secret" }, key);
    const other = { authorization: "Bearer sk-or-v1-other" };
    const wrongKey = await call("chat", { model, prompt: "Show", continuation_id: json.continuation_id }, other);
    const unknown = await call("chat", { model, prompt: "Show", continuation_id: "does-not-exist" }, other);
    expect(wrongKey.isError).toBe(true);
    expect(wrongKey.text).toContain("Unknown continuation_id");
    expect(wrongKey.text).toBe(unknown.text);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a model other than the conversation's gives isError", async () => {
    mockAnswers();
    const { json } = await call("chat", { model, prompt: "Hi" }, key);
    const res = await call("chat", { model: "google/gemini-4-argon", prompt: "Hi", continuation_id: json.continuation_id }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toContain("belongs to openai/gpt-6.1-sol");
  });

  it("does not save the turn when OpenRouter answers with an error", async () => {
    const fetch = mockAnswers();
    const { json } = await call("chat", { model, prompt: "Question 1" }, key);
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 503 }));
    const failed = await call("chat", { model, prompt: "Fails", continuation_id: json.continuation_id }, key);
    expect(failed.isError).toBe(true);
    await call("chat", { model, prompt: "Question 2", continuation_id: json.continuation_id }, key);
    expect(sentMessages(fetch, 2).map((m) => m.content)).toEqual(["Question 1", "Answer 1", "Question 2"]);
  });
});

describe("chat with files", () => {
  beforeEach(seedModels);
  const key = { authorization: "Bearer sk-or-v1-test" };
  const model = "openai/gpt-6.1-sol";
  const answer = { model, choices: [{ message: { content: "Answer" } }], usage: {} };
  const files = [
    { path: "src/A.java", content: "class A {}" },
    { path: "src/B.java", content: "class B {}" },
  ];
  const withFiles = '<file path="src/A.java">\nclass A {}\n</file>\n\n<file path="src/B.java">\nclass B {}\n</file>\n\nReview';

  it("sends the files before the prompt and stores them in the history", async () => {
    const fetch = mockOpenRouter(200, answer);
    const { json } = await call("chat", { model, prompt: "Review", files }, key);
    await call("chat", { model, prompt: "And now?", continuation_id: json.continuation_id }, key);
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages).toEqual([{ role: "user", content: withFiles }]);
    expect(JSON.parse(fetch.mock.calls[1][1].body).messages.map((m) => m.content)).toEqual([withFiles, "Answer", "And now?"]);
  });

  it("too large gives isError with numbers and does not call OpenRouter", async () => {
    const fetch = mockOpenRouter(200, answer);
    const res = await call("chat", { model, prompt: "Review", files: [{ path: "Big.java", content: "x".repeat(4000) }] }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toContain("Too large for openai/gpt-6.1-sol: about 1,0");
    expect(res.text).toContain("limit 750 (75% of the 1,000 token context window)");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the history counts toward the budget", async () => {
    mockOpenRouter(200, answer);
    const { json } = await call("chat", { model, prompt: "Review", files: [{ path: "A.java", content: "x".repeat(2000) }] }, key);
    const res = await call("chat", { model, prompt: "More", continuation_id: json.continuation_id, files: [{ path: "B.java", content: "y".repeat(1000) }] }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toContain("leave continuation_id out");
  });

  it("a model outside the catalog gives isError and does not call OpenRouter", async () => {
    const fetch = mockOpenRouter(200, answer);
    const res = await call("chat", { model: "openai/gpt-4o:free", prompt: "Review" }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toBe("Unknown model openai/gpt-4o:free. Use a slug from list_models.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives isError when the model list cannot be fetched", async () => {
    await env.CACHE.delete("models-v2");
    const fetch = mockOpenRouter(503, {});
    const res = await call("chat", { model, prompt: "Review" }, key);
    expect(res.isError).toBe(true);
    expect(res.text).toContain("Could not load the model list");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("storage cap", () => {
  // D1 is shared between the tests, so each test has its own ids.
  let prefix;
  beforeEach(() => (prefix = crypto.randomUUID()));
  const save = (id, text, limits = { max: Infinity }) =>
    saveTurn(env.DB, { id: prefix + id, keyHash: "h", model: "m", isNew: true }, text, text, {}, limits);
  const exists = async (id) => !!(await env.DB.prepare("SELECT 1 FROM conversation WHERE id = ?").bind(prefix + id).first());
  const stored = async () => (await env.DB.prepare("SELECT chars FROM stored").first()).chars;

  it("increments the sum for each turn", async () => {
    const before = await stored();
    await save("a", "x".repeat(10));
    await saveTurn(env.DB, { id: prefix + "a", keyHash: "h", model: "m", isNew: false }, "yy", "zzz");
    expect(await stored()).toBe(before + 25);
    expect((await env.DB.prepare("SELECT chars FROM conversation WHERE id = ?").bind(prefix + "a").first()).chars).toBe(25);
  });

  it("deletes the oldest conversations above the cap and keeps the newest", async () => {
    await save("a", "x".repeat(10));
    await save("b", "x".repeat(10));
    await save("c", "x".repeat(10));
    await save("d", "x".repeat(10), { max: 1, keep: 40 });
    expect(await Promise.all(["a", "b", "c", "d"].map(exists))).toEqual([false, false, true, true]);
    const messages = await env.DB.prepare("SELECT COUNT(*) AS n FROM message WHERE conversation_id IN (?, ?)")
      .bind(prefix + "a", prefix + "b")
      .first();
    expect(messages.n).toBe(0);
    expect(await stored()).toBe(40);
  });

  it("deletes nothing below the cap", async () => {
    await save("a", "x".repeat(10));
    await save("b", "x".repeat(10), { max: Number.MAX_SAFE_INTEGER, keep: 1 });
    expect(await Promise.all(["a", "b"].map(exists))).toEqual([true, true]);
  });
});

async function parse(res) {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text.split("\n").find((l) => l.startsWith("data:")).slice(5));
  }
  return JSON.parse(text);
}
