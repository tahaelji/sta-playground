import { NextResponse, type NextRequest } from "next/server";
import { getProblem } from "@/lib/problems/loader";
import { chatComplete } from "@/lib/tutor/client";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/tutor/prompts";
import type { HintTree } from "@/lib/sta/types";

function staticHint(tree: HintTree, level: number): string {
  if (level <= 0) return tree.nudge;
  if (level === 1) return tree.hint;
  return tree.walkthrough;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    problemId?: string;
    level?: number;
    history?: string[];
  };

  if (!body.problemId) {
    return NextResponse.json({ error: "problemId required" }, { status: 400 });
  }
  const problem = await getProblem(body.problemId);
  if (!problem) {
    return NextResponse.json({ error: "problem not found" }, { status: 404 });
  }

  const level = Math.max(0, Math.min(2, body.level ?? 0));
  const history = body.history ?? [];

  // If a tutor backend is configured, use it with the hintTree as grounding.
  // Otherwise fall back to the author-written hint tiers — this is the
  // default in prod and gives deterministic, guardrailed output for free.
  if (process.env.TUTOR_BASE_URL) {
    try {
      const hint = await chatComplete([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(problem, level, history) },
      ]);
      return NextResponse.json({ hint, source: "llm" });
    } catch (e) {
      return NextResponse.json({
        hint: staticHint(problem.hintTree, level),
        source: "static",
        warning: `llm unavailable: ${(e as Error).message}`,
      });
    }
  }

  return NextResponse.json({
    hint: staticHint(problem.hintTree, level),
    source: "static",
  });
}
