# mcp-roundtable

## Läs först
- README.md: vad servern gör, installation, användning, `./start.sh`, `./shell.sh`, produktions-URL och deploy vid push.
- plan.md: problem, beslut, MCP tools, steg och Cloudflare-gränser. Ändra design där, inte här.

## Konventioner
- JavaScript, ES-moduler, JSDoc vid behov. Inte TypeScript.
- Pakethanterare: Bun.
- MCP-bibliotek: `@modelcontextprotocol/server`, createMcpHandler, stateless.
- Kärnlogik i `src/core/` utan Cloudflare-beroenden, så den kan enhetstestas med `bun test`.
- Upprepa inte i CLAUDE.md det som står i README.md. Peka på README i stället och skriv här bara det README saknar.
- Text som modeller och användare läser är på engelska: verktygsbeskrivningar, parametrar, felmeddelanden, README. Kodkommentarer och testnamn på svenska.

## Kommandon
`./start.sh` och `./shell.sh` körs från Macen, se README. `./shell.sh` kräver att `./start.sh` har byggt imagen.

Nedanstående körs i Dev Containern. Macens Node är x86_64 under Rosetta, så vitest och wrangler fungerar inte utanför containern.

- `bun install` installerar beroenden.
- `bun test src` kör enhetstester i src/core.
- `bunx vitest run` kör integrationstester i workerd.
- `bunx wrangler dev` startar servern på port 8787. MCP-endpoint: `http://localhost:8787/mcp`.

## Deploy
Push till main och produktions-URL: se README. Manuell deploy från Macen, med wrangler-inloggningen monterad:
`docker run --rm -v ~/code/mcp-roundtable:/workspace -v mcp-roundtable-node-modules:/workspace/node_modules -v ~/Library/Preferences/.wrangler:/root/.config/.wrangler -w /workspace mcp-roundtable-dev bunx wrangler deploy`

## Struktur
- `src/core/` ren logik utan Cloudflare-beroenden, testas med bun test.
- `src/mcp.js` verktygsdefinitioner och MCP-server.
- `src/openrouter.js` tunt lager mot OpenRouters API.
- `src/store.js` tunt lager mot D1, konversationer för continuation_id.
- `migrations/` D1-schema. Körs mot produktion med `bunx wrangler d1 migrations apply mcp-roundtable --remote` före push, Workers Builds kör dem inte.
- `src/index.js` Worker-entry, routar till MCP-handlern.
- `test/integration/` vitest mot SELF i workerd.
