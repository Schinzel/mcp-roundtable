# critic

One or more models review something that already exists, a plan, a decision, a draft or code, and look for what is
wrong with it. Claude answers every finding.

## When to use
- Something finished: "What is wrong with this?"
- Also a conclusion you already have, without a consensus round first. That covers the tenth man used on its own.
- Not for an open question. That is [consensus](consensus.md).

## Input
- What to review: text in the prompt, or files.
- Context, and the **goal**: what it is meant to achieve. Without the goal, a critic cannot tell a defect from a
  matter of taste.
- Critics: one or more exact slugs from `list_models`, each with its own focus area (security, users, maintenance,
  ...). Different focus areas overlap less than several general reviewers.
- `thinking`: `medium` unless the user says otherwise. Sent explicitly, since some models default to `high`, and `high`
  made every model time out in the client. The user raises it for a review that deserves it.
- Every `chat` call must finish within 60 seconds, the client's limit, see Timeouts in CLAUDE.md. The prompt asks for
  an answer under 500 words. A call that times out is retried once with `thinking` one level lower, and the report
  says so. The user cannot change the limit, so the format must fit it.

## Defaults
The format must work without settings. A tired user at the end of the day wants to say "check this" and nothing more.
- When the user names no critics, Claude picks three models from `list_models`.
- When the user names no focus areas, Claude picks them from what is being reviewed. Code gets, for example,
  correctness, security and maintenance. A decision gets risk, alternatives and what cannot be undone.
- Claude never asks about the setup. It states its choice and continues.

## Flow
Every step starts with a line that shows where the review is: `Step 3 of max 6: blind review`. A conditional step
that is not run gets its own line, `Step 5 of max 6 skipped: no findings rejected`, so the numbering always holds and
it is visible why a step is missing.

1. **Claude states the goal** and what is to be reviewed, so every critic gets the same brief.
2. **Claude states the setup** to the user before any critic is called, as a table with one row per critic, the provider
   in the first column, the model slug in the second and the focus area in the third. This shows what will not be reviewed, and the user can stop and change it.
3. **Blind review.** Each critic gets its own `chat` without `continuation_id`, with its own focus area. No critic
   sees another critic's findings.
4. **Claude answers every finding:** accept or reject, with a reason. Claude neither passes the criticism on
   unexamined nor gives in to it by reflex.
5. **Second round, if Claude rejects findings.** Optional. Claude's answer goes back to that critic with
   `continuation_id`, and the critic either withdraws or holds the finding, with reasons. Only for disputed findings,
   one round.
6. **Report.** See below.

## Answer format per critic
- **Findings,** ranked by severity: critical, major, minor. Each finding has:
  - what is wrong,
  - a concrete scenario in which it causes harm,
  - a proposed fix,
  - confidence, 1–10.
- **What holds up:** what the critic checked and found sound.
- "No significant problems" is an allowed answer. Otherwise the critic invents problems.

## Report
The server instructions talk about options, which critic does not have. The same rule applies to findings: every
finding must be understandable without having seen the discussion.

A table with one row per finding: what it is, which critics raised it, severity, and Claude's verdict, accepted or
rejected, with the reason. Findings from several critics are merged into one row. Then what holds up, and the cost
line from the server instructions. The report repeats which focus area each critic had, so it is clear what was not
reviewed.

## Example report
Invented, no critic review has been run yet. Reviewed: a migration that adds a `stored` table with one row. Three
critics. This is the whole report.

**Critics**

| Provider | Model                 | Focus       |
|----------|-----------------------|-------------|
| OpenAI   | openai/gpt-6.1-sol    | correctness |
| Google   | google/gemini-4-argon | security    |
| xAI      | x-ai/grok-4.7         | maintenance |

**Findings**

| Finding                                                       | Raised by | Severity | Verdict                                                     |
|---------------------------------------------------------------|-----------|----------|-------------------------------------------------------------|
| The sum in `stored` drifts if a delete fails after the update | GPT, Grok | major    | Accepted. Update and delete go in one batch                 |
| No index on `conversation.created`, eviction scans the table  | Grok      | minor    | Accepted. Added in the same migration                       |
| `key_hash` could be rainbow-tabled                            | Gemini    | minor    | Rejected. Keys are 64 random characters, no table covers it |

Holds up: the cap and the 80 % target, the row size against D1's 2 MB limit.

Cost: 0.04 USD. GPT 0.012, Gemini 0.010, Grok 0.018. 3 200 reasoning tokens.

