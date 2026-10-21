# mcp-roundtable

Remote MCP på Cloudflare Workers som låter Claude ringa upp andra modeller via OpenRouter och låta dem diskutera med varandra.
Ersätter PAL MCP.

| Referens               | Var                                                  |
|------------------------|------------------------------------------------------|
| PAL MCP, repot         | https://github.com/BeehiveInnovations/pal-mcp-server |
| Skill som lappar PAL   | ~/.claude/skills/my-skill-pal-models/SKILL.md        |
| Syskonprojekt, mönster | ~/code/ai-storage, se DESIGN.md och CLAUDE.md        |

Status: steg 3 klart 2026-10-20. `chat` svarar från Gemini och GPT via claude.ai-connectorn, så `Authorization`
i Request headers når servern. Utan nyckel ger isError. `chat` drar 18–56 ms CPU på grund av kallstarter, se Cloudflare-gränser.
Steg 4 klart 2026-10-20: tre rundor med Gemini via claude.ai med full kontext, fel nyckel och annan modell
nekas. `chat` med D1 22–45 ms CPU, inga fel.
Steg 5 klart 2026-10-20. Budgeten testad mot produktionen med google/gemini-nano-banana-2.1 (65 536 tokens) och
en fil på 210 048 tecken: isError "Too large for ... about 52,532 tokens (files 52,523, history 0, prompt 9),
limit 49,152", utan anrop till OpenRouter. 18 ms CPU, outcome ok, ingen 1102. Testet gick via curl, eftersom
Claude inte kan skriva 210 000 tecken i ett verktygsargument. Nästa: steg 6.

# Problem att lösa
Ett andra, tredje och fjärde par ögon när det behövs:
- När man har ett svårt eller fundamentalt problem att lösa, där det är viktigt att det blir rätt
- När det är ett område där man inte är kunnig och vill vara säker på att det blir en bra lösning
- När man är beslutstrött

## Brister i PAL
PAL MCP har tre brister som en egen server tar bort:

| Brist i PAL                                    | Lösning                                     |
|------------------------------------------------|---------------------------------------------|
| Antaget kontextfönster 32k för okända modeller | `context_length` från samma endpoint        |
| Brus i svar ("AGENT'S TURN: ...")              | Svaret returneras som det är                |
| Exakta OpenRouter-slugs krävs, inga alias      | Fortsatt exakta slugs, medvetet. Inga alias |

PAL:s modellkatalog var tänkt som en fjärde brist, men 2026-10-20 visade PAL alla aktuella modeller.
Skillnaden är att `list_models` bara visar aktuella modeller, utan varianter, nyast först.

Behålls från PAL:
- continuation_id, flera rundor med samma modell och full kontext
- parallella anrop till flera modeller med samma prompt
- thinking_mode och temperature per anrop

# Mål
1. Fungerande ersättare för PAL i Claude Code och claude.ai, på alla mina datorer via en connector i claude.ai
2. Ett repo att visa upp för arbetsgivare. Konceptet "modeller diskuterar med varandra" ska synas på tio sekunder

# Beslut

| Fråga                    | Beslut                           | Varför                                           |
|--------------------------|----------------------------------|--------------------------------------------------|
| Språk och hosting        | JavaScript på Cloudflare Workers | Samma mönster som ai-storage, känt, snabbt       |
| Repo-namn                | mcp-roundtable                   | Grupperas med framtida mcp-* i ~/code            |
| Servernamn i Claude Code | roundtable                       | Prompts blir `/roundtable:consensus`             |
| Serverns ansvar          | Primitivt. Ett tool, `chat`      | Claude orkestrerar diskussionen själv, flexibelt |
| Diskussionsupplägg       | MCP-prompts i servern            | Följer med servern, kräver ingen synk            |
| Alias som "senaste GPT"  | Nej                              | Otydligt vilken modell som svarade               |
| Omfång                   | Bara chat tills det är flawless  | Få men felfria funktioner                        |

# MCP tools

## chat

| Parameter       | Typ   | Obligatorisk | Beskrivning                                               |
|-----------------|-------|--------------|-----------------------------------------------------------|
| model           | text  | ja           | Exakt OpenRouter-slug                                     |
| prompt          | text  | ja           |                                                           |
| continuation_id | text  | nej          | Fortsätter en tidigare konversation med samma modell      |
| files           | lista | nej          | Filinnehåll som skickas med. Budget från `context_length` |
| thinking        | text  | nej          | Nivå enligt OpenRouters reasoning-parameter               |
| temperature     | tal   | nej          |                                                           |

Returnerar modellens svar, continuation_id och tokenåtgång. Inget mer.

### files
Beslutat 2026-10-20. Servern kan inte läsa lokala filer, så Claude skickar `[{ path, content }]`.
- Filerna läggs före prompten, var och en som `<file path="...">...</file>`. Taggar går inte sönder av ``` i innehållet,
  och frågan sist är det modellerna rekommenderar för lång kontext.
- Prompten med filerna sparas som användarmeddelandet i D1. Filerna följer med i historiken, ingen egen tabell.
  Samma fil skickad två gånger kostar dubbelt. Egen tabell där nyaste versionen ersätter, som i PAL, om det blir ett problem.
- Budget: historik + filer + prompt, tecken/4, högst 75 % av `context_length`. Resten täcker svaret och att kod ger
  fler tokens per tecken. För stort ger isError med siffror per del, utan anrop till OpenRouter.
- `context_length` från KV-cachade modellistan. Modell utanför listan (äldre än 365 dagar, `:free`) ger isError,
  liksom fel från `/models`. Ändrat 2026-10-20, se Lagring.
- Högst 1 000 000 tecken per runda oavsett modell, eftersom D1 tillåter 2 MB per rad.

## list_models
Hämtar OpenRouter `/models` med filter hos OpenRouter, nyast först. Returnerar slug, namn, kontextfönster och datum då
modellen lades till. Filter på text i slug eller namn.

| Filter          | Värde                                     | Varför                             |
|-----------------|-------------------------------------------|------------------------------------|
| `model_authors` | openai, google, anthropic, x-ai, deepseek | Fast lista i servern               |
| `max_age_days`  | 365                                       | Gamla och döda modeller försvinner |
| I servern       | Slugs med `:` (`:batch`, `:free`) och `~` | Varianter och OpenRouters alias    |

Hela listan är 785 KB och 468 modeller. Filtrerad hos OpenRouter blir den 287 KB och 145 modeller,
varav 82 utan varianter och alias. Uppmätt 2026-10-20. Filtret hålls hos OpenRouter för att spara CPU-tid,
se Cloudflare-gränser.

Den nedbantade listan, cirka 10 KB, cachas i KV i en timme. CPU-tid per anrop, mätt 2026-10-20 via
GraphQL Analytics (`workersInvocationsAdaptive`):

| Version                  | p50    | p75     | p99     |
|--------------------------|--------|---------|---------|
| hello                    | 3,2 ms | 11,6 ms | 25,2 ms |
| list_models utan cache   | 5,5 ms | 7,8 ms  | 26,4 ms |
| list_models med KV-cache | 3,3 ms | 4,7 ms  | 30,2 ms |
| chat utan nyckel, varm   | 2,7 ms |         |         |
| chat med nyckel          | 33 ms  |         | 56 ms   |

p99 över 10 ms i alla versioner, även hello. Troligen kallstarter. Inga fel. Dashboardens "Median CPU time"
visade 16,7 ms för versionen utan cache, men den siffran stämmer inte med GraphQL.

`chat` mätt 2026-10-20 på version c17c4004, fem anrop med nyckel via claude.ai: 18, 20, 33, 37 och 56 ms,
med 1,6–5,5 s väntan på OpenRouter. Inga fel, ingen 1102. Varma anrop utan nyckel och `tools/list` tar
2,7 ms.

Utrett samma dag med en preview-version (`wrangler versions upload`) och `wrangler tail`, som visar CPU per anrop.
- Väntan kostar inget. fetch med 4 s väntan, med svar som droppar in, eller sleep: under 1 ms.
- MCP-verktyg med fetch och 4 s väntan, varm isolate: 3 ms.
- Första anropet i en ny isolate: 8–13 ms, även `tools/list` från curl. Varma: 2–3 ms.
- claude.ai-anropen kommer från olika colos i USA (EWR, ATL) och landar nästan alltid i en kall isolate.
  Protokollheadern och övriga headers spelar ingen roll.

Orsak: kallstarter. Bundlen är 886 KB, varav zod v4 och MCP-SDK:n nästan allt, och den kompileras vid första
anropet i varje isolate. Vår egen kod och OpenRouter-svaret kostar nästan inget.

Beslut 2026-10-20: låt det vara och bevaka fel (1102) i GraphQL efter varje steg. Dyker 1102 upp, byt till
Workers Paid. Att skriva MCP-protokollet själva utan SDK valdes bort, för mycket jobb för 5 USD/månad.

# MCP prompts
Diskussionsupplägg. Ren text i egna filer. Claude hämtar prompten och kör rundorna med `chat`.

| Prompt    | Upplägg                                        |
|-----------|------------------------------------------------|
| consensus | Flera modeller, flera rundor, nå samsyn        |
| tenth_man | Flera modeller, en har i uppdrag att säga emot |
| critic    | En modell granskar x och är kritisk            |

Öppet: om Claude Code kan plocka MCP-prompts själv från löpande text, eller om de bara nås via slash-kommando. Testas när servern finns.

# Lagring
KV, binding `CACHE`: modellistan för `list_models`, en timme.

D1, binding `DB`, databas `mcp-roundtable` (550def2c-7fac-4494-b862-66473b5d5f13). Konversationer för continuation_id.
Migrationer i `migrations/`, körs med `wrangler d1 migrations apply mcp-roundtable --remote` före push.
En runda sparas först när modellen har svarat. Annan modell än konversationens ger isError.

Skydd mot att någon fyller D1, beslutat 2026-10-20. Gratisplanen debiterar inte, så risken är att tjänsten
slutar fungera, inte kostnad. Rudimentärt, mot de enklaste attackerna.
- Tak 100 miljoner tecken, ungefär 100 MB. Över taket raderas de äldsta konversationerna tills 80 miljoner återstår.
  En angripare kan bara trycka ut gamla konversationer, inte stoppa tjänsten.
- `conversation.chars` per konversation och summan i tabellen `stored`, en rad. Summan i egen rad så att varje
  runda inte läser hela tabellen, gratisplanen tillåter 5 miljoner lästa rader per dygn.
- `chat` tar bara modeller i modellistan. Budgeten gäller då alltid, och `:free`-modeller kan inte fylla D1 gratis.
- Valt bort: utgångsdatum ensamt, låter en angripare blockera tills raderna går ut. Kvot per nyckel, nya
  OpenRouter-nycklar är gratis.

| Tabell       | Kolumner                                     |
|--------------|----------------------------------------------|
| conversation | id, key_hash, model, created, updated, chars |
| stored       | id (alltid 1), chars                         |
| message      | id, conversation_id, role, content, created  |

# Auth
Var och en använder sin egen OpenRouter-nyckel. Servern har ingen egen nyckel och ingen egen token.
- Nyckeln skickas i `Authorization: Bearer sk-or-...` i varje anrop och går vidare till OpenRouter.
- `chat` utan nyckel ger isError med instruktion, inte HTTP 401. En 401 på MCP-anropet stoppar även
  `list_models`, och claude.ai tolkar 401 som att servern kräver OAuth. `list_models` kräver ingen nyckel.
- Nyckeln sparas aldrig. D1 sparar SHA-256 av nyckeln i `conversation.key_hash`. Ett continuation_id
  med fel nyckel ger samma fel som ett okänt id, så andras konversationer går inte att läsa.
- Workers-loggar avstängda. Nyckeln loggas inte.

Installation, två alternativ:
1. claude.ai: custom connector, Authentication "No sign in", nyckeln under Request headers. Följer kontot till
   claude.ai, Desktop, mobil och Claude Code på alla datorer. Otestat om `Authorization` tillåts och om headern
   når Claude Code. Annars tar servern även `X-OpenRouter-Key`. Det här använder jag sedan 2026-10-20.
2. Bara Claude Code: `claude mcp add --scope user --transport http roundtable <url> --header "Authorization: Bearer sk-or-..."`.
   För Claude Code med API-nyckel. Finns båda döljer Claude Code connectorn, eftersom URL:en är densamma.

Förtroende: nyckeln passerar servern, så den som driftar servern kan i teorin läsa den. README ska säga
att man skapar en egen OpenRouter-nyckel för roundtable med kreditgräns, så den kan dras tillbaka.
Självhostning med "Deploy to Cloudflare"-knapp valdes bort 2026-10-20.

# Hosting

|                  |                                                                                    |
|------------------|------------------------------------------------------------------------------------|
| Cloudflare-konto | [borttaget], samma som ai-storage                                           |
| Account ID       | [borttaget]                                                   |
| Workers-subdomän | treceni.workers.dev                                                                |
| Adress           | https://mcp-roundtable.treceni.workers.dev                                         |
| Workers Builds   | Push till main deployar. Kräver att Cloudflares GitHub-app har tillgång till repot |

Verifierat 2026-10-15 med `wrangler whoami` i ai-storage-containern. Macens wrangler-inloggning i
`~/Library/Preferences/.wrangler` ser bara detta konto.

## Cloudflare-gränser, gratisplan
Bara CPU-tiden är en risk: 10 ms per anrop. Väntan på OpenRouter och D1 räknas inte, men parsning
och serialisering av JSON gör det. Den blir störst i `list_models` och `files`, som mäts i steg 2 och 5.
Överskridning ger Error 1102. Nödutgång: Workers Paid, 5 USD/månad, 30 s CPU.
Övrigt med god marginal: 100k anrop/dygn, 50 subrequests per anrop, D1 500 MB.

# Teknik
Kopieras från ai-storage, se dess DESIGN.md och CLAUDE.md.
- JavaScript, ES-moduler, Bun, `@modelcontextprotocol/server` v2, createMcpHandler
- `src/core/` utan Cloudflare-beroenden, `bun test`
- Integrationstester i vitest med workers-pool
- Dev Container, Workers Builds vid push till main

# Steg

| Steg | Vad                                                      | Klart när                                                |
|------|----------------------------------------------------------|----------------------------------------------------------|
| 1    | Skelett från ai-storage, deploy till Workers, hello-tool | `claude mcp add` fungerar från Claude Code               |
| 2    | `list_models` mot OpenRouter                             | Aktuella modeller, fem företag, utan varianter           |
| 3    | `chat` utan continuation, nyckel från header             | Svar från Gemini och GPT parallellt. Utan nyckel isError |
| 4    | continuation_id med D1 och key_hash                      | Tre rundor, full kontext. Fel nyckel nekas               |
| 5    | files med budget från `context_length`                   | Skicka två Java-filer utan att falla                     |
| 6    | thinking och temperature                                 |                                                          |
| 7    | Connector i claude.ai med Request headers                | En chat från claude.ai                                   |
| 8    | Prompts consensus, tenth_man, critic                     | En konsensusdiskussion körd end to end                   |
| 9    | README som säljer konceptet, gif                         |                                                          |
| 10   | Ta bort PAL och my-skill-pal-models                      |                                                          |

# Senare, inte nu
- Remote tool `discuss` som kör ett helt upplägg i servern
- Kostnadsgräns per dag
- Fler upplägg
