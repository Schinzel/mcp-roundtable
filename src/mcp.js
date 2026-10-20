import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { keyHash } from "./core/conversation.js";
import { filterModels, MAX_AGE_DAYS, MODEL_AUTHORS } from "./core/models.js";
import { chat, getModels } from "./openrouter.js";
import { loadConversation, saveTurn } from "./store.js";

const schema = (properties, required) =>
  fromJsonSchema({ type: "object", properties, required, additionalProperties: false });

const MISSING_KEY =
  "No OpenRouter key in the request. Add the header Authorization: Bearer sk-or-... to the connector or to claude mcp add. See README.";

const UNKNOWN_CONVERSATION =
  "Unknown continuation_id. It only works with the OpenRouter key that started the conversation. " +
  "Leave continuation_id out to start a new conversation.";

/**
 * @param {{ CACHE: KVNamespace, DB: D1Database }} env
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
        "Sends a prompt to another model through OpenRouter and returns its answer as is, with token usage and a continuation_id. " +
        "model is an exact slug from list_models. The model sees only the prompt and, with continuation_id, the earlier " +
        "turns of that conversation, so include all other context it needs. " +
        "To ask several models in parallel, make several chat calls at the same time, each with its own continuation_id.",
      inputSchema: schema(
        {
          model: { type: "string", description: "Exact OpenRouter slug, e.g. openai/gpt-6.1-sol" },
          prompt: { type: "string" },
          continuation_id: {
            type: "string",
            description:
              "continuation_id from an earlier chat answer. Continues that conversation with the same model. " +
              "Leave out to start a new conversation.",
          },
        },
        ["model", "prompt"],
      ),
    },
    guard(async ({ model, prompt, continuation_id }) => {
      if (!key) throw new Error(MISSING_KEY);
      const hash = await keyHash(key);
      let history = [];
      if (continuation_id) {
        const conversation = await loadConversation(env.DB, continuation_id, hash);
        if (!conversation) throw new Error(UNKNOWN_CONVERSATION);
        if (conversation.model !== model) {
          throw new Error(
            `This continuation_id belongs to ${conversation.model}. Use that model, or leave continuation_id out to start a new conversation.`,
          );
        }
        history = conversation.messages;
      }
      const answer = await chat(key, model, prompt, history);
      const id = continuation_id ?? crypto.randomUUID();
      await saveTurn(env.DB, { id, keyHash: hash, model, isNew: !continuation_id }, prompt, answer.text);
      return { ...answer, continuation_id: id };
    }),
  );

  return server;
}

/**
 * @param {{ CACHE: KVNamespace, DB: D1Database }} env
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
