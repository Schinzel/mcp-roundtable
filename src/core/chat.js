/**
 * Kropp till OpenRouters /chat/completions. Tidigare rundor går först, så modellen ser hela konversationen.
 * @param {string} model exakt OpenRouter-slug
 * @param {string} prompt
 * @param {Array<{ role: string, content: string }>} [history]
 */
export function buildChatRequest(model, prompt, history = []) {
  return { model, messages: [...history, { role: "user", content: prompt }] };
}

/**
 * Plockar ut svaret och tokenåtgången. OpenRouter kan svara 200 med ett fel i kroppen, det blir ett undantag.
 * @param {object} body svaret från /chat/completions
 * @returns {{ model: string, text: string, usage: { prompt_tokens: number, completion_tokens: number, cost?: number } }}
 */
export function parseChatResponse(body) {
  if (body.error) throw new Error(`OpenRouter: ${body.error.message ?? JSON.stringify(body.error)}`);
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("OpenRouter returned no text");
  const { prompt_tokens, completion_tokens, cost } = body.usage ?? {};
  return { model: body.model, text, usage: { prompt_tokens, completion_tokens, ...(cost !== undefined && { cost }) } };
}

/**
 * Felmeddelande för ett svar som inte är 2xx.
 * @param {number} status
 * @param {string} bodyText
 */
export function chatErrorMessage(status, bodyText) {
  let detail = bodyText.slice(0, 500);
  try {
    detail = JSON.parse(bodyText).error?.message ?? detail;
  } catch {}
  return `OpenRouter returned ${status}: ${detail}`;
}
