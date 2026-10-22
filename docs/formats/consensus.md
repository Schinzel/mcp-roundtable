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
- Optional: files and `thinking`, passed to `chat` as usual.

## Flow
1. **Claude's own analysis first.** Claude writes its own answer before any model is asked, so it is a voice of its
   own and not only the one who summarizes. It is kept for the report.
2. **Blind round.** Each model gets the same question through its own `chat` without `continuation_id`. No model sees
   another model's answer or Claude's analysis. Otherwise model 2 and 3 anchor on model 1.
3. **Tenth man, if the models agree.** See below.
4. **Second round, if the models disagree.** Optional. Each model continues its own conversation with
   `continuation_id` and gets the other answers, without model names. It either revises its answer or holds it, with
   reasons. One round, not a loop.
5. **Report.** Following the server instructions: a table that defines every option, then the outcome per option.
   Claude's own analysis is shown as its own row. Every tenth man objection gets an answer.

## Answer format per model
The prompt asks every model for exactly this structure, so the answers can be compared:
- **Verdict:** one sentence, naming the option it backs.
- **Analysis:** strengths and weaknesses, weighted by impact and likelihood. It must reflect the weight of the
  evidence: no artificial 50/50 when the reality is 90/10.
- **Confidence:** 1–10, with what drives it and what is uncertain.
- **Key takeaways:** 3–5 bullets, concrete and actionable.

## Tenth man phase
Runs when all models in the blind round back the same option.

- **Why:** the models are trained on largely the same data and tend to land in the same place. Three agreeing models
  are weaker evidence than it looks, which is exactly when a tenth man helps most.
- **What it gets:** the question, the context and the shared conclusion with its main arguments. A new conversation,
  not a continuation, so it is not anchored on its own earlier answer.
- **Its task:** assume the majority is wrong and look for why. The role steers **what it looks for**, not **what it
  may claim**. If the majority is right, it must say so.
- **Its answer:** the concrete scenario in which the majority is wrong, how likely that scenario is, and what would
  have to be true for it to happen. "The majority holds" is allowed if no credible scenario exists.
- **Claude's job:** answer every objection in the report, accept or reject with a reason. Not "the objections are
  weak".

## Open questions
- Which model plays the tenth man: one from the round, or one that did not take part?
- Does Claude's own analysis count when deciding whether the models agree?
- Is a confidence threshold needed for "agree", or is backing the same option enough?
