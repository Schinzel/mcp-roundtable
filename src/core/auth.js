/**
 * The user's OpenRouter key. Each user sends their own, the server has none. See CLAUDE.md, Auth.
 * `Authorization: Bearer` first. `X-OpenRouter-Key` if a client cannot set Authorization.
 * @param {Headers} headers
 * @returns {string | null}
 */
export function openRouterKey(headers) {
  const auth = headers.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i);
  return auth?.[1] ?? (headers.get("x-openrouter-key")?.trim() || null);
}
