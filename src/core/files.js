/** Share of the context window the input may take. The rest covers the answer and that characters/4 underestimates code. */
export const INPUT_SHARE = 0.75;

/** Maximum number of characters in a turn. D1 allows 2 MB per row, and a character can be several bytes in UTF-8. */
export const MAX_TURN_CHARS = 1_000_000;

/**
 * Estimated number of tokens, characters/4. No tokenizer, see CLAUDE.md, files.
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Places the files before the prompt, each in a tag with its path. Tags do not break on ``` in the content.
 * @param {string} prompt
 * @param {Array<{ path: string, content: string }>} [files]
 */
export function composePrompt(prompt, files = []) {
  const blocks = files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`);
  return [...blocks, prompt].join("\n\n");
}

/**
 * Error message if the turn does not fit, otherwise null. The history counts since it is resent every turn.
 * @param {{ model: string, contextLength?: number, prompt: string, composed: string,
 *   history: Array<{ content: string }>, continued: boolean }} turn
 *   composed is the prompt with the files, contextLength is missing for models outside the catalog
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
