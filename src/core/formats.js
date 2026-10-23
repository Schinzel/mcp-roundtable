/**
 * The discussion formats, written from docs/formats/*.md. One source, two renderings: the full flow as an MCP
 * prompt, and a compact version in the server instructions so Claude can run a format from running text.
 * The test checks that both renderings carry the invariants, so they cannot drift apart. See CLAUDE.md, Formats.
 */

/** Shared by both formats. The report rule itself is in the server instructions. */
const COMMON =
  "Rules for every chat call: thinking medium unless the user says otherwise, sent explicitly. Ask for an answer under " +
  "500 words. A call must finish within 60 seconds, the client's limit, so a call that times out is retried once with " +
  "thinking one level lower, and the report says so. Every step starts with a line like `Step 2 of max 5: blind round`, " +
  "and a conditional step that is not run gets its own line saying why it was skipped.";

const CONSENSUS_FLOW =
  "Run the consensus format. Several models answer an open question independently, you weigh the answers, and if " +
  "they agree a tenth man tests the shared conclusion. The user wants opinions other than yours.\n\n" +
  "Step 1 of max 5: your own analysis. Write your own answer before any model is asked, so you are a voice of your " +
  "own and cannot echo the models afterwards. You are a participant without a vote: your analysis does not count " +
  "when deciding whether the models agree, and cannot stop the tenth man. If it differs from the verdict, it is one " +
  "line in the report. Exception: if it differs because the brief lacks a fact the models could not know, correct " +
  "the brief and run the blind round again.\n\n" +
  "Step 2 of max 5: blind round. State the setup to the user as a table, one row per model: provider in the first " +
  "column, model slug in the second, thinking level in the third. At least two models, exact slugs from list_models. " +
  "Then send every model the same neutral brief through its own chat without continuation_id, so no model sees " +
  "another model's answer or your analysis. The brief has the question, the options if the user has them, the " +
  "context, constraints and what is already ruled out, and asks for exactly this structure: Verdict, one sentence " +
  "naming the option; Analysis, strengths and weaknesses weighted by impact and likelihood, no artificial 50/50; " +
  "Confidence 1–10 with what drives it; Key takeaways, 3–5 bullets. The model may propose another option.\n\n" +
  "Step 3 of max 5: second round, in one of two forms. Never both. " +
  "With a tenth man, if every model backs the same option, confidence does not matter: a new model is added and " +
  "argues against the agreed upon answer. Ask a model outside the round, one that did not take part, in a new " +
  "conversation: assume the majority is wrong and look for why. Give it the question, the context and the shared " +
  "conclusion with its main arguments. It answers with the concrete scenario in which the majority is wrong, how " +
  "likely it is, and what would have to be true. 'The majority holds' is allowed. Weigh every objection, accept or " +
  "reject with a reason. Only an objection that changes the verdict or adds a condition reaches the report. " +
  "The same three, if the models disagree: each model continues its own conversation with continuation_id and " +
  "gets the other answers without model names, and revises or holds with reasons. One round, not a loop. A " +
  "majority after this round decides.\n\n" +
  "Step 4 of max 5: deciding round, only if no option has a majority after the second round. The models end " +
  "the discussion, never you. Keep the options still backed by at least one model, ideally two, and drop the " +
  "rest. Each model continues its conversation with continuation_id, is told there was no majority, sees the " +
  "last standing of every model without names, and ranks all remaining options with one line of reason per " +
  "rank. Sum the ranks, lowest wins, a tie goes to the higher summed confidence from the second round.\n\n" +
  "Step 5 of max 5: report, following the server instructions. A table that defines every option in one line, " +
  "then a table with the chosen option: why it was chosen, backed by which models, their confidence, the " +
  "strongest counterargument. After a deciding round, backed by shows the ranks. Then the cost line. Nothing " +
  "else.\n\n" +
  COMMON;

const CRITIC_FLOW =
  "Run the critic format. Several models, each with its own focus area, review something that exists and look for " +
  "what is wrong with it. You answer every finding.\n\n" +
  "Step 1 of max 6: state the goal, what the thing is meant to achieve, and what is to be reviewed. Without the " +
  "goal a critic cannot tell a defect from a matter of taste.\n\n" +
  "Step 2 of max 6: state the setup to the user as a table before any critic is called, one row per critic: " +
  "provider in the first column, model slug in the second, focus area in the third. Defaults when the user names " +
  "none: three models from list_models, and focus areas chosen from the subject, for example correctness, security " +
  "and maintenance for code, or risk, alternatives and what cannot be undone for a decision. Never ask about the " +
  "setup, state it and continue.\n\n" +
  "Step 3 of max 6: blind review. Each critic gets its own chat without continuation_id, with the goal, the subject " +
  "as text or files, and its focus area. No critic sees another critic's findings. Ask for: findings ranked " +
  "critical, major, minor, each with what is wrong, a concrete scenario in which it causes harm, a proposed fix and " +
  "confidence 1–10; then what holds up. 'No significant problems' is an allowed answer.\n\n" +
  "Step 4 of max 6: answer every finding, accept or reject with a reason. Neither pass criticism on unexamined nor " +
  "give in by reflex.\n\n" +
  "Step 5 of max 6: second round, only for findings you rejected. Send your answer back to that critic with " +
  "continuation_id, and it withdraws or holds with reasons. One round.\n\n" +
  "Step 6 of max 6: report. The critics table from step 2, so it is clear what was not reviewed. A table with one " +
  "row per finding: the finding, which critics raised it, severity, your verdict with the reason. Findings from " +
  "several critics are merged into one row. One line with what holds up. Then the cost line. Nothing else.\n\n" +
  COMMON;

export const FORMATS = {
  consensus: {
    title: "Consensus",
    description:
      "Several models answer an open question independently. If they agree, a tenth man has to find out why they are wrong.",
    argument: { name: "question", description: "The open question, with options and context if the user has them" },
    prompt: (question) => `${CONSENSUS_FLOW}\n\nThe question:\n${question}`,
  },
  critic: {
    title: "Critic",
    description:
      "Several models, each with its own focus such as security or maintenance, review something that exists. Claude answers every finding.",
    argument: { name: "subject", description: "What to review and what it is meant to achieve. Files go in the chat calls" },
    prompt: (subject) => `${CRITIC_FLOW}\n\nThe subject:\n${subject}`,
  },
};

/**
 * The compact rendering for the server instructions, always in Claude's context. Enough to run a format from
 * running text. The prompts carry the full flow.
 */
export const FORMAT_INSTRUCTIONS =
  "Two discussion formats, run by you with chat. Use one when the user asks for other models or several models, " +
  "not for a question to a single model. The full flow is in the prompts consensus and critic.\n\n" +
  "consensus, for an open question: write your own analysis first, it does not count as a vote. State the setup as " +
  "a table, provider, model, thinking. Blind round: the same neutral brief to each model in its own chat without " +
  "continuation_id, asking for verdict, analysis, confidence 1–10 and takeaways under 500 words. Second round, in " +
  "one of two forms, never both. If every model backs the same option, with a tenth man: a model outside the " +
  "round is added and argues against the agreed upon answer. Otherwise the same three: each model sees the " +
  "others' answers without names and revises or holds. A majority after the second round decides. With no " +
  "majority, a deciding round: keep the options still backed by at least one model, each model ranks them with " +
  "continuation_id, lowest summed rank wins.\n\n" +
  "critic, for something that exists: state the goal. Default three models, each with its own focus area chosen " +
  "from the subject, never ask. State the setup as a table, provider, model, focus. Blind review, each critic in its own " +
  "chat without continuation_id, " +
  "findings ranked critical, major, minor with scenario, fix and confidence. Answer every finding, accept or reject " +
  "with a reason. A second round only for rejected findings. Report: the critics table, a table per finding with " +
  "who raised it, severity and your verdict, what holds up, the cost line.\n\n" +
  "Both: thinking medium unless the user says otherwise. Every step starts with `Step N of max X: name`, a skipped " +
  "step gets a line saying why. A chat that times out is retried once with thinking one level lower.";
