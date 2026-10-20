import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { MAX_AGE_DAYS, MODEL_AUTHORS, toModelList } from "./core/models.js";
import { fetchModels } from "./openrouter.js";

const schema = (properties, required) =>
  fromJsonSchema({ type: "object", properties, required, additionalProperties: false });

/**
 * @param {object} env
 * @returns {McpServer}
 */
export function buildServer(env) {
  const server = new McpServer({ name: "roundtable", version: "0.1.0" });

  server.registerTool(
    "list_models",
    {
      description:
        `Listar modeller på OpenRouter från ${MODEL_AUTHORS.join(", ")}, tillagda de senaste ${MAX_AGE_DAYS} dagarna, nyast först. ` +
        "Returnerar slug, namn, kontextfönster i tokens och datum då modellen lades till. Använd slug exakt som den står.",
      inputSchema: schema({ filter: { type: "string", description: "Text som måste finnas i slug eller namn, t.ex. gemini" } }, []),
    },
    guard(async ({ filter }) => ({ models: toModelList(await fetchModels(), filter) })),
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
