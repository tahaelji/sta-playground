import { notFound } from "next/navigation";
import Link from "next/link";
import { getProblem } from "@/lib/problems/loader";
import Workspace from "./Workspace";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const problem = await getProblem(id);
  if (!problem) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← all problems
        </Link>
      </div>
      <Workspace problem={problem} />
    </main>
  );
}
