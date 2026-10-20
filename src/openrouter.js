import { modelsUrl, trimCatalog } from "./core/models.js";

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
