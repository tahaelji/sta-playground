import { NextResponse, type NextRequest } from "next/server";
import { getProblem } from "@/lib/problems/loader";
import { chatComplete } from "@/lib/tutor/client";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/tutor/prompts";

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

  try {
    const hint = await chatComplete([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(problem, level, history) },
    ]);
    return NextResponse.json({ hint });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
