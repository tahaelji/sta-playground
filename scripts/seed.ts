import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { problems } from "@/lib/db/schema";
import type { Problem } from "@/lib/sta/types";

async function main() {
  const dir = join(process.cwd(), "problems");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const raw = await readFile(join(dir, f), "utf8");
    const p = JSON.parse(raw) as Problem;
    await db
      .insert(problems)
      .values({
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        tags: p.tags,
        data: p,
      })
      .onConflictDoUpdate({
        target: problems.id,
        set: {
          title: p.title,
          difficulty: p.difficulty,
          tags: p.tags,
          data: p,
        },
      });
    console.log(`seeded ${p.id}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
