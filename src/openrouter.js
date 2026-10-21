import { buildChatRequest, chatErrorMessage, parseChatResponse } from "./core/chat.js";
import { modelsUrl, trimCatalog } from "./core/models.js";

/**
 * Sends a prompt to a model with the user's own key. The key is never logged or stored.
 * @param {string} key
 * @param {string} model
 * @param {string} prompt
 * @param {Array<{ role: string, content: string }>} [history] earlier turns in the conversation
 * @param {string} [effort] thinking level, left out gives the model's default
 */
export async function chat(key, model, prompt, history, effort) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "http-referer": "https://github.com/Schinzel/mcp-roundtable",
      "x-title": "mcp-roundtable",
    },
    body: JSON.stringify(buildChatRequest(model, prompt, history, effort)),
  });
  if (!res.ok) throw new Error(chatErrorMessage(res.status, await res.text()));
  return parseChatResponse(await res.json());
}

/** Changed when the format of the cached list changes, so old entries are not read. */
const MODELS_KEY = "models-v2";
const MODELS_TTL_SECONDS = 3600;

/**
 * The model catalog, trimmed. Cached in KV for one hour, since parsing OpenRouter's full response
 * costs more CPU time than the free plan's 10 ms. See CLAUDE.md, Cloudflare limits.
 * @param {KVNamespace} cache
 * @returns {Promise<Array<{ slug: string, name: string, context_length: number, added: string }>>}
 */
export async function getModels(cache) {
  const cached = await cache.get(MODELS_KEY, "json");
  if (cached) return cached;
  const models = trimCatalog(await fetchCatalog());
  await cache.put(MODELS_KEY, JSON.stringify(models), { expirationTtl: MODELS_TTL_SECONDS });
  return models;
}

/** Fetches OpenRouter's model catalog, filtered according to src/core/models.js. Requires no key. */
async function fetchCatalog() {
  const res = await fetch(modelsUrl());
  if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
  return res.json();
}
