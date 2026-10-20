import { buildChatRequest, chatErrorMessage, parseChatResponse } from "./core/chat.js";
import { modelsUrl, trimCatalog } from "./core/models.js";

/**
 * Skickar en prompt till en modell med användarens egen nyckel. Nyckeln loggas och sparas aldrig.
 * @param {string} key
 * @param {string} model
 * @param {string} prompt
 */
export async function chat(key, model, prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "http-referer": "https://github.com/Schinzel/mcp-roundtable",
      "x-title": "mcp-roundtable",
    },
    body: JSON.stringify(buildChatRequest(model, prompt)),
  });
  if (!res.ok) throw new Error(chatErrorMessage(res.status, await res.text()));
  return parseChatResponse(await res.json());
}

const MODELS_KEY = "models";
const MODELS_TTL_SECONDS = 3600;

/**
 * Modellkatalogen, nedbantad. Cachas i KV en timme, eftersom parsning av OpenRouters fulla svar
 * kostar mer CPU-tid än gratisplanens 10 ms. Se plan.md, Cloudflare-gränser.
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

/** Hämtar OpenRouters modellkatalog, filtrerad enligt src/core/models.js. Kräver ingen nyckel. */
async function fetchCatalog() {
  const res = await fetch(modelsUrl());
  if (!res.ok) throw new Error(`OpenRouter /models svarade ${res.status}`);
  return res.json();
}
