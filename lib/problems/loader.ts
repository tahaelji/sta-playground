import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import "server-only";
import type { Problem } from "@/lib/sta/types";

const PROBLEMS_DIR = join(process.cwd(), "problems");

async function loadAll(): Promise<Map<string, Problem>> {
  const files = (await readdir(PROBLEMS_DIR)).filter((f) => f.endsWith(".json"));
  const map = new Map<string, Problem>();
  for (const f of files) {
    const raw = await readFile(join(PROBLEMS_DIR, f), "utf8");
    const p = JSON.parse(raw) as Problem;
    map.set(p.id, p);
  }
  return map;
}

export async function listProblems(): Promise<Problem[]> {
  const map = await loadAll();
  return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export async function getProblem(id: string): Promise<Problem | null> {
  const map = await loadAll();
  return map.get(id) ?? null;
}
