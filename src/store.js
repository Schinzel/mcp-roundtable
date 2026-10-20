/**
 * Läser en konversation. Okänt id och fel nyckel ger båda null, så andras konversationer går inte att skilja från
 * påhittade id.
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

/**
 * Sparar en runda, prompt och svar, efter att modellen har svarat. Skapar konversationen om den är ny.
 * @param {D1Database} db
 * @param {{ id: string, keyHash: string, model: string, isNew: boolean }} conversation
 * @param {string} prompt
 * @param {string} answer
 */
export async function saveTurn(db, { id, keyHash, model, isNew }, prompt, answer) {
  const now = new Date().toISOString();
  const message = db.prepare("INSERT INTO message (conversation_id, role, content, created) VALUES (?, ?, ?, ?)");
  await db.batch([
    isNew
      ? db
          .prepare("INSERT INTO conversation (id, key_hash, model, created, updated) VALUES (?, ?, ?, ?, ?)")
          .bind(id, keyHash, model, now, now)
      : db.prepare("UPDATE conversation SET updated = ? WHERE id = ?").bind(now, id),
    message.bind(id, "user", prompt, now),
    message.bind(id, "assistant", answer, now),
  ]);
}
