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
- Optional: `thinking`, passed to `chat` as usual.

## Flow
1. **Claude states the goal** and what is to be reviewed, so every critic gets the same brief.
2. **Blind review.** Each critic gets its own `chat` without `continuation_id`, with its own focus area. No critic
   sees another critic's findings.
3. **Claude answers every finding:** accept or reject, with a reason. Claude neither passes the criticism on
   unexamined nor gives in to it by reflex.
4. **Second round, if Claude rejects findings.** Optional. Claude's answer goes back to that critic with
   `continuation_id`, and the critic either withdraws or holds the finding, with reasons. Only for disputed findings,
   one round.
5. **Report.** See below.

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
line from the server instructions.

## Open questions
- Default number of critics, and default focus areas when the user names none?
- Should Claude pick the focus areas from what is being reviewed, or ask?
