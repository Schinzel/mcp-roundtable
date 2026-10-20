import { modelsUrl } from "./core/models.js";

/**
 * Hämtar OpenRouters modellkatalog, filtrerad enligt src/core/models.js. Kräver ingen nyckel.
 * @returns {Promise<{ data: Array<object> }>}
 */
export async function fetchModels() {
  const res = await fetch(modelsUrl());
  if (!res.ok) throw new Error(`OpenRouter /models svarade ${res.status}`);
  return res.json();
}
