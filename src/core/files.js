/** Andel av kontextfönstret som indata får ta. Resten täcker svaret och att tecken/4 underskattar kod. */
export const INPUT_SHARE = 0.75;

/** Högsta antal tecken i en runda. D1 tillåter 2 MB per rad, och ett tecken kan bli flera byte i UTF-8. */
export const MAX_TURN_CHARS = 1_000_000;

/**
 * Uppskattat antal tokens, tecken/4. Ingen tokenizer, se plan.md, steg 5.
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Lägger filerna före prompten, var och en i en tagg med sökvägen. Taggar går inte sönder av ``` i innehållet.
 * @param {string} prompt
 * @param {Array<{ path: string, content: string }>} [files]
 */
export function composePrompt(prompt, files = []) {
  const blocks = files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`);
  return [...blocks, prompt].join("\n\n");
}

/**
 * Felmeddelande om rundan inte får plats, annars null. Historiken räknas in eftersom den skickas om varje runda.
 * @param {{ model: string, contextLength?: number, prompt: string, composed: string,
 *   history: Array<{ content: string }>, continued: boolean }} turn
 *   composed är prompten med filerna, contextLength saknas för modeller utanför katalogen
 * @returns {string | null}
 */
export function budgetError({ model, contextLength, prompt, composed, history, continued }) {
  const hint = continued
    ? "Send fewer or smaller files, or leave continuation_id out to start a new conversation."
    : "Send fewer or smaller files.";
  if (composed.length > MAX_TURN_CHARS) {
    return `Too large to store: ${n(composed.length)} characters in this turn, limit ${n(MAX_TURN_CHARS)}. ${hint}`;
  }
  if (!contextLength) return null;
  const promptTokens = estimateTokens(prompt);
  const filesTokens = estimateTokens(composed) - promptTokens;
  const historyTokens = history.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const total = promptTokens + filesTokens + historyTokens;
  const limit = Math.floor(contextLength * INPUT_SHARE);
  if (total <= limit) return null;
  return (
    `Too large for ${model}: about ${n(total)} tokens (files ${n(filesTokens)}, history ${n(historyTokens)}, ` +
    `prompt ${n(promptTokens)}), limit ${n(limit)} (${INPUT_SHARE * 100}% of the ${n(contextLength)} token context window). ${hint}`
  );
}

const n = (x) => x.toLocaleString("en-US");
