-- Usage per turn, on the assistant message. NULL on user messages and on turns saved before this migration.
-- cost_usd is as OpenRouter reports it. thinking is the level sent, NULL for the model's default. See CLAUDE.md, Usage.
ALTER TABLE message ADD COLUMN prompt_tokens INTEGER;
ALTER TABLE message ADD COLUMN completion_tokens INTEGER;
ALTER TABLE message ADD COLUMN reasoning_tokens INTEGER;
ALTER TABLE message ADD COLUMN cost_usd REAL;
ALTER TABLE message ADD COLUMN thinking TEXT;
