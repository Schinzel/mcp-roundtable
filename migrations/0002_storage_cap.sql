-- Cap for stored volume. conversation.chars is the number of characters in the conversation's messages, stored.chars the sum of all.
-- The sum is kept in its own row so that each turn does not read the whole table. See CLAUDE.md, Storage.
ALTER TABLE conversation ADD COLUMN chars INTEGER NOT NULL DEFAULT 0;

UPDATE conversation
SET chars = (SELECT COALESCE(SUM(length(content)), 0) FROM message WHERE message.conversation_id = conversation.id);

CREATE TABLE IF NOT EXISTS stored (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chars INTEGER NOT NULL
);

INSERT INTO stored (id, chars) SELECT 1, COALESCE(SUM(chars), 0) FROM conversation;
