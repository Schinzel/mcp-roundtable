-- Tak för lagrad volym. conversation.chars är antal tecken i konversationens meddelanden, stored.chars summan av alla.
-- Summan hålls i en egen rad så att varje runda inte läser hela tabellen. Se CLAUDE.md, Lagring.
ALTER TABLE conversation ADD COLUMN chars INTEGER NOT NULL DEFAULT 0;

UPDATE conversation
SET chars = (SELECT COALESCE(SUM(length(content)), 0) FROM message WHERE message.conversation_id = conversation.id);

CREATE TABLE IF NOT EXISTS stored (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chars INTEGER NOT NULL
);

INSERT INTO stored (id, chars) SELECT 1, COALESCE(SUM(chars), 0) FROM conversation;
