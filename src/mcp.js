import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { greeting } from "./core/hello.js";

const schema = (properties, required) =>
  fromJsonSchema({ type: "object", properties, required, additionalProperties: false });

/**
 * @param {object} env
 * @returns {McpServer}
 */
export function buildServer(env) {
  const server = new McpServer({ name: "roundtable", version: "0.1.0" });

  server.registerTool(
    "hello",
    {
      description: "Testverktyg. Returnerar en hälsning för att visa att servern svarar.",
      inputSchema: schema({ name: { type: "string" } }, []),
    },
    guard(async ({ name }) => ({ text: greeting(name) })),
  );

  return server;
}

/** @param {object} env */
export function createHandler(env) {
  return createMcpHandler(() => buildServer(env));
}

/** Kör verktyget, svarar med JSON som text, och gör fel till isError i stället för protokollfel. */
function guard(fn) {
  return async (args) => {
    try {
      const result = await fn(args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  };
}
