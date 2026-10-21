/**
 * Reads a conversation. An unknown id and a wrong key both give null, so other people's conversations cannot be told
 * apart from made-up ids.
 * @param {D1Database} db
 * @param {string} id
 * @param {string} keyHash
 * @returns {Promise<{ model: string, messages: Array<{ role: string, content: string }> } | null>}
 */
export async function loadConversation(db, id, keyHash) {
  const [conversation, messages] = await db.batch([
    db.prepare("SELECT model FROM conversation WHERE id = ? AND key_hash = ?").bind(id, keyHash),
    db
      .prepare(
        "SELECT m.role, m.content FROM message m JOIN conversation c ON c.id = m.conversation_id " +
          "WHERE c.id = ? AND c.key_hash = ? ORDER BY m.id",
      )
      .bind(id, keyHash),
  ]);
  const model = conversation.results[0]?.model;
  return model ? { model, messages: messages.results } : null;
}

/** Cap for stored characters, roughly bytes. The free plan allows 500 MB per database. See CLAUDE.md, Storage. */
export const MAX_STORED_CHARS = 100_000_000;

/** Above the cap the oldest conversations are deleted until this much remains, so it does not happen every turn. */
export const KEEP_STORED_CHARS = 80_000_000;

/**
 * Saves a turn, prompt and answer, after the model has answered. Creates the conversation if it is new.
 * Usage and the thinking level go on the assistant message. See CLAUDE.md, Usage.
 * If the stored volume goes over the cap, the oldest conversations are deleted.
 * @param {D1Database} db
 * @param {{ id: string, keyHash: string, model: string, isNew: boolean }} conversation
 * @param {string} prompt
 * @param {string} answer
 * @param {{ usage?: { prompt_tokens?: number, completion_tokens?: number, reasoning_tokens?: number, cost_usd?: number },
 *   thinking?: string }} [meta]
 * @param {{ max?: number, keep?: number }} [limits] for tests
 */
export async function saveTurn(db, { id, keyHash, model, isNew }, prompt, answer, meta = {}, limits = {}) {
  const { max = MAX_STORED_CHARS, keep = KEEP_STORED_CHARS } = limits;
  const now = new Date().toISOString();
  const chars = prompt.length + answer.length;
  const { usage = {}, thinking } = meta;
  const message = db.prepare("INSERT INTO message (conversation_id, role, content, created) VALUES (?, ?, ?, ?)");
  const reply = db.prepare(
    "INSERT INTO message (conversation_id, role, content, created, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, thinking) " +
      "VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?)",
  );
  const results = await db.batch([
    isNew
      ? db
          .prepare("INSERT INTO conversation (id, key_hash, model, created, updated, chars) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, keyHash, model, now, now, chars)
      : db.prepare("UPDATE conversation SET updated = ?, chars = chars + ? WHERE id = ?").bind(now, chars, id),
    message.bind(id, "user", prompt, now),
    reply.bind(
      id,
      answer,
      now,
      usage.prompt_tokens ?? null,
      usage.completion_tokens ?? null,
      usage.reasoning_tokens ?? null,
      usage.cost_usd ?? null,
      thinking ?? null,
    ),
    db.prepare("UPDATE stored SET chars = chars + ? WHERE id = 1 RETURNING chars").bind(chars),
  ]);
  if (results.at(-1).results[0].chars > max) await evict(db, keep);
}

/**
 * Deletes the oldest conversations until the newest that fit within keep remain, and recalculates the sum.
 * @param {D1Database} db
 * @param {number} keep
 */
async function evict(db, keep) {
  const oldest =
    "SELECT id FROM (SELECT id, SUM(chars) OVER (ORDER BY updated DESC, rowid DESC) AS kept FROM conversation) WHERE kept > ?";
  await db.batch([
    db.prepare(`DELETE FROM message WHERE conversation_id IN (${oldest})`).bind(keep),
    db.prepare(`DELETE FROM conversation WHERE id IN (${oldest})`).bind(keep),
    db.prepare("UPDATE stored SET chars = (SELECT COALESCE(SUM(chars), 0) FROM conversation) WHERE id = 1"),
  ]);
}
