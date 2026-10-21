import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { keyHash } from "./core/conversation.js";
import { budgetError, composePrompt } from "./core/files.js";
import { filterModels, MAX_AGE_DAYS, MODEL_AUTHORS } from "./core/models.js";
import { resolveThinking, THINKING_LEVELS } from "./core/thinking.js";
import { chat, getModels } from "./openrouter.js";
import { loadConversation, saveTurn } from "./store.js";

const schema = (properties, required) =>
  fromJsonSchema({ type: "object", properties, required, additionalProperties: false });

/** Shown to Claude by the client. Option table and cost line in every report, see CLAUDE.md, Reporting. */
const INSTRUCTIONS =
  "Roundtable lets you ask other models through OpenRouter. You run the discussion yourself with list_models and chat.\n\n" +
  "When a discussion compares options, never refer to an option by a letter or number alone in your report to the user. " +
  "Start with a table that defines every option: its label, what it is, and what choosing it means. " +
  "Then show the outcome per option: which models backed it, their confidence, and the strongest counterargument. " +
  "The user must be able to understand the result without having seen the discussion.\n\n" +
  "End the report with one line of cost: total USD, per model, and reasoning tokens, from usage in the chat answers. " +
  "If a turn has no cost_usd, say the total is a lower bound.";

const MISSING_KEY =
  "No OpenRouter key in the request. Add the header Authorization: Bearer sk-or-... to the connector or to claude mcp add. See README.";

const MODELS_UNAVAILABLE = "Could not load the model list from OpenRouter, so the model cannot be checked. Try again shortly.";

const UNKNOWN_CONVERSATION =
  "Unknown continuation_id. It only works with the OpenRouter key that started the conversation. " +
  "Leave continuation_id out to start a new conversation.";

/**
 * @param {{ CACHE: KVNamespace, DB: D1Database }} env
 * @param {string | null} key the user's OpenRouter key from the header
 * @returns {McpServer}
 */
export function buildServer(env, key) {
  const server = new McpServer({ name: "roundtable", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_models",
    {
      description:
        `Lists OpenRouter models from ${MODEL_AUTHORS.join(", ")}, added in the last ${MAX_AGE_DAYS} days, newest first. ` +
        "Returns slug, name, context window in tokens, the date the model was added, and the thinking levels the model " +
        "supports with its default. Use the slug exactly as written.",
      inputSchema: schema({ filter: { type: "string", description: "Text that must appear in the slug or name, e.g. gemini" } }, []),
    },
    guard(async ({ filter }) => ({ models: filterModels(await getModels(env.CACHE), filter) })),
  );

  server.registerTool(
    "chat",
    {
      description:
        "Sends a prompt to another model through OpenRouter and returns its answer as is, with token usage and a continuation_id. " +
        "model is an exact slug from list_models, other models are refused. The model sees only the prompt and, with continuation_id, the earlier " +
        "turns of that conversation, so include all other context it needs. " +
        "To ask several models in parallel, make several chat calls at the same time, each with its own continuation_id. " +
        "Files are kept in the conversation, so with continuation_id send only new or changed files. " +
        "When reporting a discussion of options, follow the server instructions: a table that defines each option before any verdict.",
      inputSchema: schema(
        {
          model: { type: "string", description: "Exact OpenRouter slug, e.g. openai/gpt-6.1-sol" },
          prompt: { type: "string" },
          thinking: {
            type: "string",
            enum: THINKING_LEVELS,
            description:
              `How much the model reasons before answering, on the scale ${THINKING_LEVELS.join(" < ")}. ` +
              "Models support different levels; list_models shows each model's levels and default. If the model lacks " +
              "the requested level, the server uses the nearest level the model has, and the higher one on a tie. " +
              "The answer's thinking field shows the level that was used. Models with no levels in list_models ignore it. " +
              "Leave out to use the model's default. Applies to this turn only.",
          },
          continuation_id: {
            type: "string",
            description:
              "continuation_id from an earlier chat answer. Continues that conversation with the same model. " +
              "Leave out to start a new conversation.",
          },
          files: {
            type: "array",
            description:
              "Files the model should read, sent before the prompt with the path as a label. The server cannot read files, " +
              "so send the content. Too large for the model's context window gives an error with the estimated size.",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "Path shown to the model, e.g. src/main/java/Foo.java" },
                content: { type: "string", description: "The full text of the file" },
              },
              required: ["path", "content"],
              additionalProperties: false,
            },
          },
        },
        ["model", "prompt"],
      ),
    },
    guard(async ({ model, prompt, thinking, continuation_id, files }) => {
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
      const composed = composePrompt(prompt, files);
      const { context_length: contextLength, thinking: levels } = await modelOf(env.CACHE, model);
      const tooLarge = budgetError({ model, contextLength, prompt, composed, history, continued: !!continuation_id });
      if (tooLarge) throw new Error(tooLarge);
      const effort = resolveThinking(thinking, levels);
      const answer = await chat(key, model, composed, history, effort);
      const id = continuation_id ?? crypto.randomUUID();
      const conversation = { id, keyHash: hash, model, isNew: !continuation_id };
      await saveTurn(env.DB, conversation, composed, answer.text, { usage: answer.usage, thinking: effort });
      return { ...answer, ...(effort && { thinking: effort }), continuation_id: id };
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

/**
 * The model from the cached catalog. Only models in the catalog are allowed, so the budget always
 * applies and no one can fill D1 for free via `:free` models. See CLAUDE.md, Storage.
 * @param {KVNamespace} cache
 * @param {string} model
 * @returns {Promise<{ context_length: number, thinking?: string[] }>}
 */
async function modelOf(cache, model) {
  let models;
  try {
    models = await getModels(cache);
  } catch {
    throw new Error(MODELS_UNAVAILABLE);
  }
  const found = models.find((m) => m.slug === model);
  if (!found) throw new Error(`Unknown model ${model}. Use a slug from list_models.`);
  return found;
}

/** Runs the tool, answers with JSON as text, and turns errors into isError instead of protocol errors. */
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
