/**
 * SHA-256 av nyckeln, hex. Sparas i conversation.key_hash i stället för nyckeln. Se plan.md, Auth.
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function keyHash(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
