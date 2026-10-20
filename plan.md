# mcp-roundtable

Remote MCP på Cloudflare Workers som låter Claude ringa upp andra modeller via OpenRouter och låta dem diskutera med varandra.
Ersätter PAL MCP.

| Referens                | Var                                                        |
|-------------------------|------------------------------------------------------------|
| PAL MCP, repot          | https://github.com/BeehiveInnovations/pal-mcp-server        |
| Skill som lappar PAL    | ~/.claude/skills/my-skill-pal-models/SKILL.md               |
| Syskonprojekt, mönster  | ~/code/ai-storage, se DESIGN.md och CLAUDE.md               |

Status: steg 2 klart 2026-10-20. `list_models` deployat, `claude mcp add` fungerar.

# Problem att lösa
Ett andra, tredje och fjärde par ögon när det behövs:
- När man har ett svårt eller fundamentalt problem att lösa, där det är viktigt att det blir rätt
- När det är ett område där man inte är kunnig och vill vara säker på att det blir en bra lösning
- När man är beslutstrött

## Brister i PAL
PAL MCP har fyra brister som en egen server tar bort:

| Brist i PAL                                     | Lösning                                        |
|-------------------------------------------------|------------------------------------------------|
| Frusen modellkatalog, döda modeller, saknar nya | Katalog hämtas från OpenRouter `/models`       |
| Antaget kontextfönster 32k för okända modeller  | `context_length` från samma endpoint           |
| Brus i svar ("AGENT'S TURN: ...")               | Svaret returneras som det är                   |
| Exakta OpenRouter-slugs krävs, inga alias       | Fortsatt exakta slugs, medvetet. Inga alias    |

Behålls från PAL:
- continuation_id, flera rundor med samma modell och full kontext
- parallella anrop till flera modeller med samma prompt
- thinking_mode och temperature per anrop

# Mål
1. Fungerande ersättare för PAL i Claude Code, på alla mina datorer med en `claude mcp add`
2. Ett repo att visa upp för arbetsgivare. Konceptet "modeller diskuterar med varandra" ska synas på tio sekunder

# Beslut

| Fråga                       | Beslut                                   | Varför                                                      |
|-----------------------------|------------------------------------------|-------------------------------------------------------------|
| Språk och hosting           | JavaScript på Cloudflare Workers         | Samma mönster som ai-storage, känt, snabbt                  |
| Repo-namn                   | mcp-roundtable                           | Grupperas med framtida mcp-* i ~/code                       |
| Servernamn i Claude Code    | roundtable                               | Prompts blir `/roundtable:consensus`                        |
| Serverns ansvar             | Primitivt. Ett tool, `chat`              | Claude orkestrerar diskussionen själv, flexibelt            |
| Diskussionsupplägg          | MCP-prompts i servern                    | Följer med servern vid `claude mcp add`, kräver ingen synk  |
| Alias som "senaste GPT"     | Nej                                      | Otydligt vilken modell som svarade                          |
| Omfång                      | Bara chat tills det är flawless          | Få men felfria funktioner                                   |

# MCP tools

## chat

| Parameter       | Typ     | Obligatorisk | Beskrivning                                               |
|-----------------|---------|--------------|-----------------------------------------------------------|
| model           | text    | ja           | Exakt OpenRouter-slug                                     |
| prompt          | text    | ja           |                                                           |
| continuation_id | text    | nej          | Fortsätter en tidigare konversation med samma modell      |
| files           | lista   | nej          | Filinnehåll som skickas med. Budget från `context_length` |
| thinking        | text    | nej          | Nivå enligt OpenRouters reasoning-parameter               |
| temperature     | tal     | nej          |                                                           |

Returnerar modellens svar, continuation_id och tokenåtgång. Inget mer.

## list_models
Hämtar OpenRouter `/models` med filter hos OpenRouter, nyast först. Returnerar slug, namn, kontextfönster och datum då
modellen lades till. Filter på text i slug eller namn.

| Filter          | Värde                                         | Varför                                   |
|-----------------|-----------------------------------------------|------------------------------------------|
| `model_authors` | openai, google, anthropic, x-ai, deepseek     | Fast lista i servern                     |
| `max_age_days`  | 365                                           | Gamla och döda modeller försvinner       |
| I servern       | Slugs med `:` (`:batch`, `:free`) och `~`     | Varianter och OpenRouters alias          |

Hela listan är 785 KB och 468 modeller. Filtrerad hos OpenRouter blir den 287 KB och 145 modeller,
varav 82 utan varianter och alias. Uppmätt 2026-10-20. Filtret hålls hos OpenRouter för att spara CPU-tid,
se Cloudflare-gränser.

# MCP prompts
Diskussionsupplägg. Ren text i egna filer. Claude hämtar prompten och kör rundorna med `chat`.

| Prompt    | Upplägg                                                      |
|-----------|--------------------------------------------------------------|
| consensus | Flera modeller, flera rundor, nå samsyn                      |
| tenth_man | Flera modeller, en har i uppdrag att säga emot               |
| critic    | En modell granskar x och är kritisk                          |

Öppet: om Claude Code kan plocka MCP-prompts själv från löpande text, eller om de bara nås via slash-kommando. Testas när servern finns.

# Lagring
D1. Konversationer för continuation_id.

| Tabell       | Kolumner                                              |
|--------------|-------------------------------------------------------|
| conversation | id, model, created, updated                           |
| message      | id, conversation_id, role, content, created           |

# Auth
Skiljer sig från ai-storage. Här ligger en OpenRouter-nyckel bakom, så servern får inte vara öppen.
- Bearer-token i `Authorization`-header. Token som Workers-secret.
- OpenRouter-nyckel som Workers-secret.
- `claude mcp add --transport http roundtable <url> --header "Authorization: Bearer <token>"`

# Hosting

| | |
|------------------|-------------------------------------------|
| Cloudflare-konto | [borttaget], samma som ai-storage  |
| Account ID       | [borttaget]          |
| Workers-subdomän | treceni.workers.dev                       |
| Adress           | https://mcp-roundtable.treceni.workers.dev |
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

| Steg | Vad                                                           | Klart när                                          |
|------|---------------------------------------------------------------|----------------------------------------------------|
| 1    | Skelett från ai-storage, deploy till Workers, hello-tool      | `claude mcp add` fungerar från Claude Code         |
| 2    | `list_models` mot OpenRouter                                  | Visar en modell PAL saknar                         |
| 3    | `chat` utan continuation                                      | Ett svar från Gemini och ett från GPT, parallellt  |
| 4    | continuation_id med D1                                        | Tre rundor med samma modell, full kontext          |
| 5    | files med budget från `context_length`                        | Skicka två Java-filer utan att falla               |
| 6    | thinking och temperature                                      |                                                    |
| 7    | Auth med bearer-token                                         | Anrop utan token ger 401                           |
| 8    | Prompts consensus, tenth_man, critic                          | En konsensusdiskussion körd end to end             |
| 9    | README som säljer konceptet, gif                              |                                                    |
| 10   | Ta bort PAL och my-skill-pal-models                           |                                                    |

# Senare, inte nu
- Remote tool `discuss` som kör ett helt upplägg i servern
- Kostnadsgräns per dag
- Fler upplägg
