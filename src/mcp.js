import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { filterModels, MAX_AGE_DAYS, MODEL_AUTHORS } from "./core/models.js";
import { chat, getModels } from "./openrouter.js";

const schema = (properties, required) =>
  fromJsonSchema({ type: "object", properties, required, additionalProperties: false });

const MISSING_KEY =
  "No OpenRouter key in the request. Add the header Authorization: Bearer sk-or-... to the connector or to claude mcp add. See README.";

/**
 * @param {{ CACHE: KVNamespace }} env
 * @param {string | null} key användarens OpenRouter-nyckel från headern
 * @returns {McpServer}
 */
export function buildServer(env, key) {
  const server = new McpServer({ name: "roundtable", version: "0.1.0" });

  server.registerTool(
    "list_models",
    {
      description:
        `Lists OpenRouter models from ${MODEL_AUTHORS.join(", ")}, added in the last ${MAX_AGE_DAYS} days, newest first. ` +
        "Returns slug, name, context window in tokens and the date the model was added. Use the slug exactly as written.",
      inputSchema: schema({ filter: { type: "string", description: "Text that must appear in the slug or name, e.g. gemini" } }, []),
    },
    guard(async ({ filter }) => ({ models: filterModels(await getModels(env.CACHE), filter) })),
  );

  server.registerTool(
    "chat",
    {
      description:
        "Sends a prompt to another model through OpenRouter and returns its answer as is, with token usage. " +
        "model is an exact slug from list_models. The model only sees the prompt, so include all the context it needs. " +
        "To ask several models in parallel, make several chat calls at the same time.",
      inputSchema: schema(
        {
          model: { type: "string", description: "Exact OpenRouter slug, e.g. openai/gpt-6.1-sol" },
          prompt: { type: "string" },
        },
        ["model", "prompt"],
      ),
    },
    guard(async ({ model, prompt }) => {
      if (!key) throw new Error(MISSING_KEY);
      return chat(key, model, prompt);
    }),
  );

  return server;
}

/**
 * @param {{ CACHE: KVNamespace }} env
 * @param {string | null} key
 */
export function createHandler(env, key) {
  return createMcpHandler(() => buildServer(env, key));
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
