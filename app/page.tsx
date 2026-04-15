import Link from "next/link";
import { listProblems } from "@/lib/problems/loader";

export default async function Home() {
  const problems = await listProblems();
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">STA Playground</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          LeetCode-style timing closure. Fully-defined designs with a restricted
          command palette — find the violation, pick a fix, close the loop.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-medium">Problems</h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
          {problems.map((p) => (
            <li key={p.id}>
              <Link
                href={`/problems/${p.id}`}
                className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-1 flex gap-2 text-xs text-zinc-500">
                    <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
                      {p.difficulty}
                    </span>
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-zinc-400">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
