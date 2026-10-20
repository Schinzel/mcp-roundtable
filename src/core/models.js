/** Företag vars modeller list_models visar. Filtret körs hos OpenRouter för att spara CPU-tid. */
export const MODEL_AUTHORS = ["openai", "google", "anthropic", "x-ai", "deepseek"];

/** Modeller som lagts till hos OpenRouter för längre sedan visas inte. De går fortfarande att anropa med slug. */
export const MAX_AGE_DAYS = 365;

/** @returns {string} URL till OpenRouters modellkatalog, filtrerad och nyast först */
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
 * Bantar ned OpenRouters svar till det list_models returnerar. Resultatet är det som cachas.
 * Varianter som `:batch` och `:free` och OpenRouters alias med `~` tas bort.
 * @param {{ data: Array<{ id: string, name: string, context_length: number, created: number }> }} catalog
 * @returns {Array<{ slug: string, name: string, context_length: number, added: string }>}
 */
export function trimCatalog(catalog) {
  return catalog.data
    .filter((m) => !m.id.includes(":") && !m.id.startsWith("~"))
    .map((m) => ({
      slug: m.id,
      name: m.name,
      context_length: m.context_length,
      added: new Date(m.created * 1000).toISOString().slice(0, 10),
    }));
}

/**
 * @param {Array<{ slug: string, name: string }>} models
 * @param {string} [filter] text som måste finnas i slug eller namn, skiftlägesokänsligt
 */
export function filterModels(models, filter) {
  const needle = filter?.trim().toLowerCase();
  if (!needle) return models;
  return models.filter((m) => m.slug.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle));
}
