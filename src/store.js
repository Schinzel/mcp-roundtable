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

/** Tak för lagrade tecken, ungefär byte. Gratisplanen tillåter 500 MB per databas. Se CLAUDE.md, Lagring. */
export const MAX_STORED_CHARS = 100_000_000;

/** Över taket raderas de äldsta konversationerna tills så här mycket återstår, så att det inte sker varje runda. */
export const KEEP_STORED_CHARS = 80_000_000;

/**
 * Sparar en runda, prompt och svar, efter att modellen har svarat. Skapar konversationen om den är ny.
 * Går den lagrade volymen över taket raderas de äldsta konversationerna.
 * @param {D1Database} db
 * @param {{ id: string, keyHash: string, model: string, isNew: boolean }} conversation
 * @param {string} prompt
 * @param {string} answer
 * @param {{ max?: number, keep?: number }} [limits] för tester
 */
export async function saveTurn(db, { id, keyHash, model, isNew }, prompt, answer, limits = {}) {
  const { max = MAX_STORED_CHARS, keep = KEEP_STORED_CHARS } = limits;
  const now = new Date().toISOString();
  const chars = prompt.length + answer.length;
  const message = db.prepare("INSERT INTO message (conversation_id, role, content, created) VALUES (?, ?, ?, ?)");
  const results = await db.batch([
    isNew
      ? db
          .prepare("INSERT INTO conversation (id, key_hash, model, created, updated, chars) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, keyHash, model, now, now, chars)
      : db.prepare("UPDATE conversation SET updated = ?, chars = chars + ? WHERE id = ?").bind(now, chars, id),
    message.bind(id, "user", prompt, now),
    message.bind(id, "assistant", answer, now),
    db.prepare("UPDATE stored SET chars = chars + ? WHERE id = 1 RETURNING chars").bind(chars),
  ]);
  if (results.at(-1).results[0].chars > max) await evict(db, keep);
}

/**
 * Raderar de äldsta konversationerna tills de nyaste som ryms inom keep återstår, och räknar om summan.
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
