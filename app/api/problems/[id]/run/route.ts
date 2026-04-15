import { NextResponse, type NextRequest } from "next/server";
import { getProblem } from "@/lib/problems/loader";
import { createContext, runCommand } from "@/lib/sta/simulator";
import { parseCommand } from "@/lib/sta/commands";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const problem = await getProblem(id);
  if (!problem) {
    return NextResponse.json({ error: "problem not found" }, { status: 404 });
  }

  const body = (await req.json()) as { command?: string };
  if (!body.command) {
    return NextResponse.json({ error: "command required" }, { status: 400 });
  }

  const parsed = parseCommand(body.command);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const ctx = createContext(problem);
  const output = runCommand(ctx, parsed);
  return NextResponse.json({ output });
}
