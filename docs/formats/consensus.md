# consensus

Several models answer the same open question independently. Claude weighs the answers and reports what each option
gets. If the models agree, a tenth man tests the shared conclusion.

## When to use
- An open question: "What should we do?" or "Which of these options?"
- Not for reviewing something that already exists. That is [critic](critic.md).

## Input
- The question, and the options if the user has them. Claude may add options the models propose.
- Context: constraints, goals, what has already been ruled out.
- Models: at least two exact slugs from `list_models`.
- Every model gets the same neutral brief. The only thing that varies is which model answers.
- Optional: files, passed to `chat` as usual.
- `thinking`: `medium` unless the user says otherwise. Sent explicitly, since some models default to `high`, and `high`
  made every model time out in the client. The user raises it for a question that deserves it.
- Every `chat` call must finish within 60 seconds, the client's limit, see Timeouts in CLAUDE.md. The prompt asks for
  an answer under 500 words. A call that times out is retried once with `thinking` one level lower, and the report
  says so. The user cannot change the limit, so the format must fit it.

## Flow
The whole protocol:

```
analysis = claude.own_analysis(question)        # no vote

answers = for each model: chat(brief)           # blind round, no continuation_id

if all answers back the same option:            # second round, with a tenth man
    objection = tenth_man(question, shared conclusion)   # a model outside the round
    chosen = shared option, with any condition the objection adds
else:                                           # second round, the same three
    answers = for each model: chat(other answers, no names)   # continuation_id
    if an option has a majority:
        chosen = that option
    else:                                       # deciding round
        remaining = options still backed by at least one model
        ranks = for each model: chat(rank remaining)
        chosen = lowest summed rank, tie by summed confidence

report(options, chosen, why, backed by, confidence, counterargument, cost)
```

The steps below carry the reasons. Every step starts with a line that shows where the discussion is:
`Step 2 of max 5: blind round`. A conditional step that is not run gets its own line,
`Step 4 of max 5 skipped: majority after the second round`, so the numbering always holds and it is visible why a
step is missing.

1. **Claude's own analysis first.** Claude writes its own answer before any model is asked, so it is a voice of its
   own and not only the one who summarizes. It is kept for the report. Claude is a participant without a vote: the
   analysis does not count when deciding whether the models agree, so it cannot stop the tenth man. The user asks
   the models to get an opinion other than Claude's, and Claude already writes the brief, judges the tenth man and
   writes the report. If Claude's analysis differs from the verdict, it is one line in the report.
   One exception: if Claude's analysis differs because the brief lacks a fact, a constraint the models could not
   know, the brief is corrected and the blind round is run again. A missing fact is a briefing defect, not a
   difference of opinion.
2. **Blind round.** Claude first states the setup to the user as a table with one row per model, the provider in the
   first column and the model slug in the second, plus the `thinking` level. Then each model gets the same question
   through its own `chat` without `continuation_id`. No model sees another model's answer or Claude's analysis.
   Otherwise model 2 and 3 anchor on model 1.
3. **Second round.** One step in two forms, and which one runs depends on the blind round. Never both: agreement
   after a round with the same three is already tested, since every model has seen the objections.
   - **With a tenth man, if the models agree.** A new model is added and argues against the agreed upon answer.
     See below.
   - **The same three, if the models disagree.** Each model continues its own conversation with `continuation_id`
     and gets the other answers, without model names. It either revises its answer or holds it, with reasons. One
     round, not a loop. A majority after this round decides.
4. **Deciding round, if no option has a majority after the second round.** The discussion needs a way to end, and
   the models end it, not Claude: a choice by someone outside the discussion is not the discussion's conclusion.
   The options that are still backed by at least one model stay, ideally two, more when the models are spread out.
   Options nobody backs any more are dropped. Each model continues its own conversation, is told there was no
   majority, sees the last standing of every model without names, and ranks the remaining options, all of them,
   with one line of reason per rank. Ranks are summed, the lowest sum wins. A tie goes to the option with the
   higher summed confidence from the second round. Ranking rather than one more vote, because a 1-1-1 split often
   hides an option that is everybody's first or second choice.
5. **Report.** Following the server instructions: a table that defines every option in one line each, then a table
   with the chosen option: why it was chosen, which models backed it, confidence, strongest counterargument. Then the
   cost line. Nothing else. The why column is there because a report that gives the counterargument but not the
   argument reads backwards. After a deciding round, backed by shows the ranks, `Gemini 1st, Grok 2nd, GPT 2nd`.
   Claude's own analysis and the tenth man's objections appear only if they change the verdict, one line each.

## Example report
From a real discussion, 2026-10-22. Question: how should the formats be delivered to Claude so that both running
text and an explicit command work? Three models, two rounds. This is the whole report.

**Options**

| Option         | What it is                                                                             |
|----------------|----------------------------------------------------------------------------------------|
| Tools like PAL | The server holds the prompts, calls the models and drives the flow with state in D1    |
| Prompts        | The full rules, compact, in the server instructions, and the same rules as MCP prompts |
| Playbook tools | Thin tools that only return the format text, Claude runs the flow with `chat`          |

**Chosen**

| Chosen  | Why                                                                                          | Backed by         | Confidence | Strongest counterargument                                                        |
|---------|----------------------------------------------------------------------------------------------|-------------------|------------|----------------------------------------------------------------------------------|
| Prompts | One source, and the instructions are the only text Claude always sees, so running text works | GPT, Gemini, Grok | 8, 9, 7    | Instructions can be buried in a long context, so the prompts must carry the flow |

Cost: 0.07 USD, lower bound. GPT 0.019, Gemini 0.017, Grok 0.032. 5 439 reasoning tokens.

## Answer format per model
The prompt asks every model for exactly this structure, so the answers can be compared:
- **Verdict:** one sentence, naming the option it backs.
- **Analysis:** strengths and weaknesses, weighted by impact and likelihood. It must reflect the weight of the
  evidence: no artificial 50/50 when the reality is 90/10.
- **Confidence:** 1–10, with what drives it and what is uncertain.
- **Key takeaways:** 3–5 bullets, concrete and actionable.

## Tenth man phase
Runs when all models in the blind round back the same option. Backing the same option is enough, confidence does not matter:
low confidence on the same option is still untested agreement, and the tenth man is cheap.

- **Why:** the models are trained on largely the same data and tend to land in the same place. Three agreeing models
  are weaker evidence than it looks, which is exactly when a tenth man helps most.
- **Who:** a model that did not take part in the round. A model from the round has already taken a side.
- **What it gets:** the question, the context and the shared conclusion with its main arguments. A new conversation,
  not a continuation, so it is not anchored on its own earlier answer.
- **Its task:** assume the majority is wrong and look for why. The role steers **what it looks for**, not **what it
  may claim**. If the majority is right, it must say so.
- **Its answer:** the concrete scenario in which the majority is wrong, how likely that scenario is, and what would
  have to be true for it to happen. "The majority holds" is allowed if no credible scenario exists.
- **Claude's job:** weigh every objection, accept or reject with a reason. Not "the objections are weak". Only an
  objection that changes the verdict, or adds a condition to it, reaches the report.
