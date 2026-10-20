# mcp-roundtable

A remote MCP server that lets Claude call other models through OpenRouter and have them discuss a problem with each other.

Use it when you want a second, third or fourth opinion: a hard problem where getting it right matters, or a field you don't know well (or you're just too tired to trust yourself). Claude asks GPT, Gemini, Grok or DeepSeek, argues with their answers and tells you where they agreed and where they didn't.

Runs on Cloudflare Workers. You bring your own OpenRouter key.

> **Status:** early. `list_models` works. `chat` and the discussion prompts are being built. See [plan.md](plan.md).

## What it does

The server is deliberately small. It gives Claude one way to talk to another model, and Claude runs the discussion itself.

| Tool          | What it does                                                                                       |
|---------------|----------------------------------------------------------------------------------------------------|
| `list_models` | Current models from OpenAI, Google, Anthropic, xAI and DeepSeek, newest first, with context size   |
| `chat`        | Sends a prompt to one model. Pass `continuation_id` to keep talking with the same model *(coming)* |

| Prompt      | Setup *(coming)*                                          |
|-------------|-----------------------------------------------------------|
| `consensus` | Several models, several rounds, until they agree          |
| `tenth_man` | Several models, one of them has to argue against the rest |
| `critic`    | One model reviews something and is told to be harsh       |

Model names are exact OpenRouter slugs, like `openai/gpt-6.1-sol`. No aliases such as "latest GPT", so you always know which model answered.

## Install

### 1. Create an OpenRouter key

Create a separate key for roundtable at [openrouter.ai/keys](https://openrouter.ai/keys) and give it a credit limit, say $5.

Your key passes through this server on every call. It's never stored or logged (conversations are tied to a SHA-256 hash of the key), but whoever runs the server could in theory read it. A dedicated key with a limit means a leak costs you at most the limit, and you can revoke it at any time.

### 2. Add the server

**Claude Code**

```bash
claude mcp add --scope user --transport http roundtable \
  https://mcp-roundtable.treceni.workers.dev/mcp \
  --header "Authorization: Bearer sk-or-..."
```

`--scope user` makes it available in every project. Run `claude mcp list` to check that it says Connected.

**claude.ai, Claude Desktop and the mobile apps**

Add a custom connector in claude.ai settings:

- URL: `https://mcp-roundtable.treceni.workers.dev/mcp`
- Authentication: No sign in
- Request headers: `Authorization: Bearer sk-or-...`

The connector follows your account to Desktop and mobile. (Not tested yet.)

## Use

Ask Claude in plain words. It picks the tools.

```
Which Gemini models can roundtable reach?
```

```
Ask openai/gpt-6.1-sol and google/gemini-4-argon whether this migration
should use a single transaction. Show me where they disagree.
```

```
/roundtable:consensus Should we cache the model list in KV or in D1?
```

In Claude Code the prompts appear as slash commands under `/roundtable:`.

## Development

JavaScript on Cloudflare Workers, Bun, the official MCP SDK. Everything runs in a Dev Container. See [CLAUDE.md](CLAUDE.md) for commands and [plan.md](plan.md) for design decisions.

```bash
./start.sh    # local server on http://localhost:8787/mcp
./shell.sh    # shell in the container: bun test src, bunx vitest run
```

Push to `main` deploys through Workers Builds.
