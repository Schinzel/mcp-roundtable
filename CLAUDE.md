# mcp-roundtable

Remote MCP-server på Cloudflare Workers som låter Claude ringa upp andra modeller via OpenRouter och låta dem diskutera med varandra.

## Läs först
- plan.md: problem, beslut, MCP tools, steg och Cloudflare-gränser. Ändra design där, inte här.

## Konventioner
- JavaScript, ES-moduler, JSDoc vid behov. Inte TypeScript.
- Pakethanterare: Bun.
- MCP-bibliotek: `@modelcontextprotocol/server`, createMcpHandler, stateless.
- Kärnlogik i `src/core/` utan Cloudflare-beroenden, så den kan enhetstestas med `bun test`.

## Kommandon
- `./start.sh` från Macen: bygger containern vid behov och startar servern på port 8787.
- `./shell.sh` från Macen: skal i containern för att köra kommandona nedan. Kräver att `./start.sh` har byggt imagen.

Nedanstående körs i Dev Containern. Macens Node är x86_64 under Rosetta, så vitest och wrangler fungerar inte utanför containern.

- `bun install` installerar beroenden.
- `bun test src` kör enhetstester i src/core.
- `bunx vitest run` kör integrationstester i workerd.
- `bunx wrangler dev` startar servern på port 8787. MCP-endpoint: `http://localhost:8787/mcp`.

## Deploy
Push till main deployar automatiskt via Workers Builds till https://mcp-roundtable.treceni.workers.dev, MCP på `/mcp`.
Manuell deploy från Macen, med wrangler-inloggningen monterad:
`docker run --rm -v ~/code/mcp-roundtable:/workspace -v mcp-roundtable-node-modules:/workspace/node_modules -v ~/Library/Preferences/.wrangler:/root/.config/.wrangler -w /workspace mcp-roundtable-dev bunx wrangler deploy`

## Struktur
- `src/core/` ren logik utan Cloudflare-beroenden, testas med bun test.
- `src/mcp.js` verktygsdefinitioner och MCP-server.
- `src/index.js` Worker-entry, routar till MCP-handlern.
- `test/integration/` vitest mot SELF i workerd.
