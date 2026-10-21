/** Companies whose models list_models shows. The filter runs at OpenRouter to save CPU time. */
export const MODEL_AUTHORS = ["openai", "google", "anthropic", "x-ai", "deepseek"];

/** Models added to OpenRouter longer ago are not shown. They can still be called by slug. */
export const MAX_AGE_DAYS = 365;

/** @returns {string} URL to OpenRouter's model catalog, filtered and newest first */
export function modelsUrl() {
  const params = new URLSearchParams({
    model_authors: MODEL_AUTHORS.join(","),
    max_age_days: String(MAX_AGE_DAYS),
    sort: "newest",
    limit: "1000",
  });
  return `https://openrouter.ai/api/v1/models?${params}`;
}

/**
 * Trims OpenRouter's response down to what list_models returns. The result is what gets cached.
 * Variants like `:batch` and `:free` and OpenRouter's aliases with `~` are removed.
 * Models without effort levels get no thinking fields.
 * @param {{ data: Array<{ id: string, name: string, context_length: number, created: number,
 *   reasoning?: { supported_efforts?: string[], default_effort?: string } }> }} catalog
 * @returns {Array<{ slug: string, name: string, context_length: number, added: string,
 *   thinking?: string[], default_thinking?: string }>}
 */
export function trimCatalog(catalog) {
  return catalog.data
    .filter((m) => !m.id.includes(":") && !m.id.startsWith("~"))
    .map((m) => ({
      slug: m.id,
      name: m.name,
      context_length: m.context_length,
      added: new Date(m.created * 1000).toISOString().slice(0, 10),
      ...thinkingOf(m.reasoning),
    }));
}

/** @param {{ supported_efforts?: string[], default_effort?: string } | undefined} reasoning */
function thinkingOf(reasoning) {
  const levels = reasoning?.supported_efforts;
  if (!levels?.length) return {};
  return { thinking: levels, ...(reasoning.default_effort && { default_thinking: reasoning.default_effort }) };
}

/**
 * @param {Array<{ slug: string, name: string }>} models
 * @param {string} [filter] text that must appear in the slug or name, case-insensitive
 */
export function filterModels(models, filter) {
  const needle = filter?.trim().toLowerCase();
  if (!needle) return models;
  return models.filter((m) => m.slug.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle));
}
