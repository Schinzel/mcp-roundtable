# mcp-roundtable

## Läs först
- README.md: vad servern gör, installation och användning, för användare. Produktions-URL:en står där.
- Beslut nedan: skäl som inte syns i koden. Nya designbeslut skrivs där.

## Konventioner
- JavaScript, ES-moduler, JSDoc vid behov. Inte TypeScript.
- Pakethanterare: Bun.
- MCP-bibliotek: `@modelcontextprotocol/server`, createMcpHandler, stateless.
- Kärnlogik i `src/core/` utan Cloudflare-beroenden, så den kan enhetstestas med `bun test`.
- Upprepa inte i CLAUDE.md det som står i README.md. Peka på README i stället. Utvecklarinfo hör hemma här, README pekar hit.
- Text som modeller och användare läser är på engelska: verktygsbeskrivningar, parametrar, felmeddelanden, README. Kodkommentarer och testnamn på svenska.

## Kommandon
- `./start.sh` från Macen: bygger containern vid behov och startar servern på port 8787.
- `./shell.sh` från Macen: skal i containern för att köra kommandona nedan. Kräver att `./start.sh` har byggt imagen.

Nedanstående körs i Dev Containern. Macens Node är x86_64 under Rosetta, så vitest och wrangler fungerar inte utanför containern.

- `bun install` installerar beroenden.
- `bun test src` kör enhetstester i src/core.
- `bunx vitest run` kör integrationstester i workerd.
- `bunx wrangler dev` startar servern på port 8787. MCP-endpoint: `http://localhost:8787/mcp`.

## Deploy
Push till main deployar automatiskt via Workers Builds till produktions-URL:en i README.
Manuell deploy från Macen, med wrangler-inloggningen monterad:
`docker run --rm -v ~/code/mcp-roundtable:/workspace -v mcp-roundtable-node-modules:/workspace/node_modules -v ~/Library/Preferences/.wrangler:/root/.config/.wrangler -w /workspace mcp-roundtable-dev bunx wrangler deploy`

Cloudflare-kontot är [borttaget], Account ID [borttaget], samma som ai-storage.
Macens wrangler-inloggning ser bara det kontot. Workers Builds kräver att Cloudflares GitHub-app har tillgång till repot.

## Struktur
- `src/core/` ren logik utan Cloudflare-beroenden, testas med bun test.
- `src/mcp.js` verktygsdefinitioner och MCP-server.
- `src/openrouter.js` tunt lager mot OpenRouters API.
- `src/store.js` tunt lager mot D1, konversationer för continuation_id.
- `migrations/` D1-schema. Körs mot produktion med `bunx wrangler d1 migrations apply mcp-roundtable --remote` före push, Workers Builds kör dem inte.
- `src/index.js` Worker-entry, routar till MCP-handlern.
- `test/integration/` vitest mot SELF i workerd.

## Beslut

### Omfång
- Servern är primitiv: `list_models` och `chat`. Claude kör diskussionen själv, och upplägg blir MCP-prompts.
- Bara exakta OpenRouter-slugs, inga alias som "senaste GPT", så att det syns vilken modell som svarade.
- Få men felfria funktioner. Inget nytt förrän `chat` fungerar felfritt.

### list_models
- Filtret `model_authors` och `max_age_days` 365 körs hos OpenRouter för att spara CPU. Hela listan är 785 KB.
- Servern tar bort slugs med `:` och `~`, alltså varianter som `:free` och OpenRouters alias.
- Den nedbantade listan, cirka 10 KB, cachas i KV en timme.

### files
- Filerna läggs före prompten som `<file path="...">...</file>`. Taggar går inte sönder av ``` i innehållet,
  och frågan sist är det modellerna rekommenderar för lång kontext.
- Filerna sparas i användarmeddelandet i D1, ingen egen tabell. Samma fil två gånger kostar dubbelt.
  Byt till en egen tabell där nyaste versionen ersätter, som i PAL, om det blir ett problem.
- Budget: historik + filer + prompt, tecken/4, högst 75 % av `context_length`. Ingen tokenizer. Resten täcker
  svaret och att kod ger fler tokens per tecken. För stort ger isError utan anrop till OpenRouter.
- Högst 1 000 000 tecken per runda oavsett modell, eftersom D1 tillåter 2 MB per rad.
- Testa budgeten med curl mot `/mcp` och en påhittad nyckel. Budgetkontrollen kommer före OpenRouter, och Claude
  kan inte skriva 200 000 tecken i ett verktygsargument.

### Lagring
- Skydd mot att någon fyller D1. Gratisplanen debiterar inte, så risken är att tjänsten slutar fungera.
  Tak 100 miljoner tecken. Över taket raderas de äldsta konversationerna tills 80 miljoner återstår.
  En angripare kan bara trycka ut gamla konversationer, inte stoppa tjänsten.
- Summan ligger i tabellen `stored`, en rad, så att varje runda inte läser hela tabellen.
  Gratisplanen tillåter 5 miljoner lästa rader per dygn.
- `chat` tar bara modeller i modellistan. Då gäller budgeten alltid, och `:free`-modeller kan inte fylla D1 gratis.
- Valt bort: bara utgångsdatum, som låter en angripare blockera tills raderna går ut. Kvot per nyckel,
  eftersom nya OpenRouter-nycklar är gratis.
- En runda sparas först när modellen har svarat.

### Auth
- Varje användare skickar sin egen OpenRouter-nyckel i `Authorization: Bearer`. Servern har ingen egen.
- `chat` utan nyckel ger isError, inte HTTP 401. En 401 stoppar även `list_models`, och claude.ai tolkar 401
  som att servern kräver OAuth.
- Nyckeln sparas aldrig. D1 har SHA-256 av den i `conversation.key_hash`. Fel nyckel ger samma fel som ett okänt
  continuation_id, så andras konversationer går inte att läsa.
- Workers-loggar är avstängda. Logga aldrig nyckeln.
- Självhostning med "Deploy to Cloudflare"-knapp valdes bort.

### Cloudflare-gränser
- Gratisplanen ger 10 ms CPU per anrop. Över gränsen ger Error 1102. Väntan på OpenRouter och D1 räknas inte.
- `chat` drar 18–56 ms på grund av kallstarter. Bundlen är 886 KB, mest zod och MCP-SDK:n, och kompileras i varje
  ny isolate. Anrop från claude.ai landar nästan alltid i en kall isolate. Varma anrop tar 2–3 ms. Ingen 1102 hittills.
- Beslut: låt det vara och kolla efter 1102 efter varje steg, med `wrangler tail mcp-roundtable --format json`
  (cpuTime, outcome). Dyker 1102 upp, byt till Workers Paid, 5 USD/månad, 30 s CPU.
  Att skriva MCP-protokollet utan SDK valdes bort, för mycket jobb för 5 USD/månad.

## Kvar att göra
Steg 1–5 klara 2026-10-20: skelett, `list_models`, `chat`, continuation_id och files.

| Steg | Vad                                                    | Klart när                                     |
|------|--------------------------------------------------------|-----------------------------------------------|
| 6    | `thinking` enligt OpenRouters reasoning, `temperature` |                                               |
| 7    | Connector i claude.ai                                  | Används redan. Kvar: når headern Claude Code? |
| 8    | Prompts consensus, tenth_man, critic                   | En konsensusdiskussion körd end to end        |
| 9    | README som säljer konceptet, gif                       | Konceptet syns på tio sekunder                |
| 10   | Ta bort PAL och my-skill-pal-models                    |                                               |

Öppet till steg 8: om Claude Code plockar MCP-prompts själv ur löpande text, eller bara via slash-kommando.

Senare, inte nu: verktyget `discuss` som kör ett helt upplägg i servern, kostnadsgräns per dag, fler upplägg.
