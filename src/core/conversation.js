/**
 * SHA-256 of the key, hex. Stored in conversation.key_hash instead of the key. See CLAUDE.md, Auth.
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function keyHash(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
