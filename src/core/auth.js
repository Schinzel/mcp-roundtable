/**
 * Användarens OpenRouter-nyckel. Var och en skickar sin egen, servern har ingen. Se plan.md, Auth.
 * `Authorization: Bearer` i första hand. `X-OpenRouter-Key` om en klient inte kan sätta Authorization.
 * @param {Headers} headers
 * @returns {string | null}
 */
export function openRouterKey(headers) {
  const auth = headers.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i);
  return auth?.[1] ?? (headers.get("x-openrouter-key")?.trim() || null);
}
