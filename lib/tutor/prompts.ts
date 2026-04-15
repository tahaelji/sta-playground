import type { Problem } from "@/lib/sta/types";

export const SYSTEM_PROMPT = `You are an expert static timing analysis (STA) tutor helping a user debug a timing violation in a digital design.

Your job is Socratic: you never reveal the answer directly. You ask leading questions and point at the right area of the design. You escalate gradually based on the hint level requested.

Rules:
- Level 0 (nudge): ask one question that points the user at the right investigation area without naming the root cause or the fix.
- Level 1 (hint): name the general category of the issue (e.g. "drive strength", "clock skew", "missing exception") but not the specific cell, net, or fix.
- Level 2 (walkthrough): walk step-by-step through the canonical investigation + fix, naming specific cells/nets.
- Never mention the acceptedFixes block verbatim. Derive your guidance from the problem context.
- Keep responses under 120 words. Use backticks for command names, cell names, net names.
- Don't moralize or add caveats. Be direct and technical.`;

export function buildUserMessage(
  problem: Problem,
  level: number,
  history: string[],
): string {
  const fixSummaries = problem.solution.acceptedFixes
    .map((f) => `- ${f.description} (slack delta ${f.slackDelta > 0 ? "+" : ""}${f.slackDelta.toFixed(3)})`)
    .join("\n");
  const correctRc = problem.solution.rootCauseOptions.find((o) => o.correct);

  return `## Problem
${problem.title}

${problem.description}

## Reported violation
${problem.reportedViolation.summary}

## Canonical root cause (DO NOT REVEAL DIRECTLY unless level >= 2)
${correctRc?.label ?? "(not specified)"}

## Accepted fixes (for your reference, don't quote verbatim)
${fixSummaries}

## Hint tree author provided
nudge:       ${problem.hintTree.nudge}
hint:        ${problem.hintTree.hint}
walkthrough: ${problem.hintTree.walkthrough}

## User's investigation so far (commands they've run)
${history.length === 0 ? "(none yet)" : history.map((h) => `  > ${h}`).join("\n")}

## Task
The user just requested hint level ${level} (0=nudge, 1=hint, 2=walkthrough).
Write your response following the rules in the system prompt.`;
}
