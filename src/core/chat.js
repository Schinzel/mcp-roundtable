/**
 * Body for OpenRouter's /chat/completions. Earlier turns go first, so the model sees the whole conversation.
 * The reasoning is always removed from the answer, Claude only needs the conclusion. See CLAUDE.md, thinking.
 * @param {string} model exact OpenRouter slug
 * @param {string} prompt
 * @param {Array<{ role: string, content: string }>} [history]
 * @param {string} [effort] level from resolveThinking, left out gives the model's default
 */
export function buildChatRequest(model, prompt, history = [], effort) {
  return {
    model,
    messages: [...history, { role: "user", content: prompt }],
    reasoning: { ...(effort && { effort }), exclude: true },
  };
}

/**
 * Extracts the answer and the token usage. OpenRouter can answer 200 with an error in the body, that becomes an exception.
 * @param {object} body the response from /chat/completions
 * @returns {{ model: string, text: string, usage: { prompt_tokens: number, completion_tokens: number, reasoning_tokens?: number, cost_usd?: number } }}
 */
export function parseChatResponse(body) {
  if (body.error) throw new Error(`OpenRouter: ${body.error.message ?? JSON.stringify(body.error)}`);
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("OpenRouter returned no text");
  const { prompt_tokens, completion_tokens, completion_tokens_details, cost } = body.usage ?? {};
  const reasoning_tokens = completion_tokens_details?.reasoning_tokens;
  return {
    model: body.model,
    text,
    usage: {
      prompt_tokens,
      completion_tokens,
      ...(reasoning_tokens !== undefined && { reasoning_tokens }),
      ...(cost !== undefined && { cost_usd: cost }),
    },
  };
}

/**
 * Error message for a response that is not 2xx. Out of credits gets its own message that says what to do.
 * 402 is the account or key out of credits, 403 with limit_source the key's own limit. See CLAUDE.md, Errors.
 * @param {number} status
 * @param {string} bodyText
 */
export function chatErrorMessage(status, bodyText) {
  let detail = bodyText.slice(0, 500);
  let limitSource;
  try {
    const { error } = JSON.parse(bodyText);
    detail = error?.message ?? detail;
    limitSource = error?.metadata?.limit_source;
  } catch {}
  if (status === 402 || (status === 403 && limitSource === "openrouter_key_limit")) {
    return `${OUT_OF_CREDITS} OpenRouter said: ${detail}`;
  }
  return `OpenRouter returned ${status}: ${detail}`;
}

const OUT_OF_CREDITS =
  "Your OpenRouter account or key is out of credits. Add credits at https://openrouter.ai/settings/credits, " +
  "or raise the key's limit, and retry. The conversation is kept, so the same continuation_id still works.";
