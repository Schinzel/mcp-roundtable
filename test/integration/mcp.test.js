import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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
    expect(body.result.tools.map((t) => t.name)).toEqual(["hello"]);
  });

  it("hello svarar", async () => {
    const body = await rpc("tools/call", { name: "hello", arguments: { name: "Henrik" } });
    expect(JSON.parse(body.result.content[0].text)).toEqual({ text: "Hej Henrik, roundtable svarar." });
  });

  it("andra sökvägar ger 404", async () => {
    const res = await SELF.fetch("http://example.com/annat");
    expect(res.status).toBe(404);
  });
});

async function parse(res) {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text.split("\n").find((l) => l.startsWith("data:")).slice(5));
  }
  return JSON.parse(text);
}
