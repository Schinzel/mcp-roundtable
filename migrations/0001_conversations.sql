-- Konversationer för continuation_id. key_hash är SHA-256 av användarens OpenRouter-nyckel, nyckeln sparas aldrig.
CREATE TABLE IF NOT EXISTS conversation (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversation (id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS message_conversation ON message (conversation_id, id);
