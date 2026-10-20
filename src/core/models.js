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
 * Bantar ned OpenRouters svar till det list_models returnerar.
 * Varianter som `:batch` och `:free` och OpenRouters alias med `~` tas bort.
 * @param {{ data: Array<{ id: string, name: string, context_length: number, created: number }> }} catalog
 * @param {string} [filter] text som måste finnas i slug eller namn, skiftlägesokänsligt
 * @returns {Array<{ slug: string, name: string, context_length: number, added: string }>}
 */
export function toModelList(catalog, filter) {
  const needle = filter?.trim().toLowerCase();
  return catalog.data
    .filter((m) => !m.id.includes(":") && !m.id.startsWith("~"))
    .filter((m) => !needle || m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle))
    .map((m) => ({
      slug: m.id,
      name: m.name,
      context_length: m.context_length,
      added: new Date(m.created * 1000).toISOString().slice(0, 10),
    }));
}
