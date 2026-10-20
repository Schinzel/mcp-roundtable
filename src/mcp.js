import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { filterModels, MAX_AGE_DAYS, MODEL_AUTHORS } from "./core/models.js";
import { chat, getModels } from "./openrouter.js";

const schema = (properties, required) =>
  fromJsonSchema({ type: "object", properties, required, additionalProperties: false });

const MISSING_KEY =
  "Ingen OpenRouter-nyckel i anropet. Lägg till headern Authorization: Bearer sk-or-... i connectorn eller i claude mcp add. Se README.";

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
        `Listar modeller på OpenRouter från ${MODEL_AUTHORS.join(", ")}, tillagda de senaste ${MAX_AGE_DAYS} dagarna, nyast först. ` +
        "Returnerar slug, namn, kontextfönster i tokens och datum då modellen lades till. Använd slug exakt som den står.",
      inputSchema: schema({ filter: { type: "string", description: "Text som måste finnas i slug eller namn, t.ex. gemini" } }, []),
    },
    guard(async ({ filter }) => ({ models: filterModels(await getModels(env.CACHE), filter) })),
  );

  server.registerTool(
    "chat",
    {
      description:
        "Skickar en prompt till en annan modell via OpenRouter och returnerar svaret som det är, med tokenåtgång. " +
        "model är en exakt slug från list_models. Modellen ser bara prompten, så ta med all kontext den behöver. " +
        "Anropa flera modeller parallellt genom att göra flera chat-anrop samtidigt.",
      inputSchema: schema(
        {
          model: { type: "string", description: "Exakt OpenRouter-slug, t.ex. openai/gpt-6.1-sol" },
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
