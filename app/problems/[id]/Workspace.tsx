"use client";

import { useState, useMemo, useCallback } from "react";
import type { Problem } from "@/lib/sta/types";
import { COMMANDS } from "@/lib/sta/commands";

type ConsoleLine =
  | { kind: "input"; text: string }
  | { kind: "output"; text: string }
  | { kind: "error"; text: string };

type Stage = "investigate" | "diagnose" | "fix" | "done";

export default function Workspace({ problem }: { problem: Problem }) {
  const [lines, setLines] = useState<ConsoleLine[]>([
    { kind: "output", text: problem.reportedViolation.summary },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("investigate");
  const [chosenDiagnosis, setChosenDiagnosis] = useState<string | null>(null);
  const [chosenFix, setChosenFix] = useState<string | null>(null);
  const [effectiveSlack, setEffectiveSlack] = useState<number>(
    problem.reportedViolation.slack,
  );
  const [commandCount, setCommandCount] = useState(0);

  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  const availableCommands = useMemo(
    () => problem.validCommands.map((id) => COMMANDS[id]).filter(Boolean),
    [problem.validCommands],
  );

  const runCommand = useCallback(
    async (line: string) => {
      if (!line.trim()) return;
      setBusy(true);
      setLines((ls) => [...ls, { kind: "input", text: line }]);
      try {
        const res = await fetch(`/api/problems/${problem.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: line }),
        });
        const data = (await res.json()) as { output?: string; error?: string };
        if (data.error) {
          setLines((ls) => [...ls, { kind: "error", text: data.error! }]);
        } else {
          setLines((ls) => [...ls, { kind: "output", text: data.output ?? "" }]);
          setCommandCount((n) => n + 1);
        }
      } catch (e) {
        setLines((ls) => [
          ...ls,
          { kind: "error", text: `request failed: ${(e as Error).message}` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [problem.id],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const line = input;
    setInput("");
    runCommand(line);
  };

  const submitDiagnosis = async () => {
    if (!chosenDiagnosis) return;
    const opt = problem.solution.rootCauseOptions.find(
      (o) => o.id === chosenDiagnosis,
    );
    if (opt?.correct) {
      setLines((ls) => [
        ...ls,
        { kind: "output", text: `✓ diagnosis correct: ${opt.label}` },
      ]);
      setStage("fix");
    } else {
      setLines((ls) => [
        ...ls,
        {
          kind: "error",
          text: `✗ not quite. Keep investigating before committing.`,
        },
      ]);
    }
  };

  const applyFix = (fixId: string) => {
    const fix = problem.solution.acceptedFixes.find((f) => f.id === fixId);
    if (!fix) return;
    setChosenFix(fixId);
    setEffectiveSlack((s) => s + fix.slackDelta);
    setLines((ls) => [
      ...ls,
      { kind: "output", text: `applied: ${fix.description}` },
      {
        kind: "output",
        text: `new slack: ${(problem.reportedViolation.slack + fix.slackDelta).toFixed(3)} ns`,
      },
    ]);
    setStage("done");
  };

  const requestHint = async () => {
    if (hintLevel >= 3) return;
    setHintLoading(true);
    try {
      const res = await fetch(`/api/tutor/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          level: hintLevel,
          history: lines.filter((l) => l.kind === "input").map((l) => l.text),
        }),
      });
      const data = (await res.json()) as { hint?: string; error?: string };
      if (data.error) {
        setHintText(`(tutor unavailable: ${data.error})`);
      } else {
        setHintText(data.hint ?? "");
        setHintLevel((n) => n + 1);
      }
    } catch (e) {
      setHintText(`(tutor unavailable: ${(e as Error).message})`);
    } finally {
      setHintLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-semibold mb-2">{problem.title}</h1>
        <div className="mb-4 flex gap-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
            {problem.difficulty}
          </span>
          {problem.tags.map((t) => (
            <span key={t} className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
              {t}
            </span>
          ))}
          <span className="ml-auto">commands used: {commandCount}</span>
        </div>

        <article className="prose prose-sm dark:prose-invert mb-6 max-w-none whitespace-pre-wrap text-sm">
          {problem.description}
        </article>

        <div className="mb-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            Console
          </div>
          <div className="h-96 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 font-mono text-xs">
            {lines.map((l, i) => (
              <pre
                key={i}
                className={
                  l.kind === "input"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : l.kind === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-900 dark:text-zinc-100"
                }
              >
                {l.kind === "input" ? `> ${l.text}` : l.text}
              </pre>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy || stage === "done"}
              placeholder="report_timing -from ... -to ..."
              className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-xs"
            />
            <button
              type="submit"
              disabled={busy || stage === "done"}
              className="rounded bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              run
            </button>
          </form>
        </div>

        {stage === "investigate" && (
          <button
            onClick={() => setStage("diagnose")}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
          >
            Commit to diagnosis →
          </button>
        )}

        {stage === "diagnose" && (
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="mb-3 text-sm font-medium">What is the root cause?</div>
            <div className="space-y-2">
              {problem.solution.rootCauseOptions.map((opt) => (
                <label key={opt.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="diagnosis"
                    checked={chosenDiagnosis === opt.id}
                    onChange={() => setChosenDiagnosis(opt.id)}
                    className="mt-1"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <button
              onClick={submitDiagnosis}
              disabled={!chosenDiagnosis}
              className="mt-4 rounded bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              submit diagnosis
            </button>
          </div>
        )}

        {stage === "fix" && (
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="mb-3 text-sm font-medium">Pick a fix</div>
            <div className="space-y-2">
              {problem.solution.acceptedFixes.map((fix) => (
                <button
                  key={fix.id}
                  onClick={() => applyFix(fix.id)}
                  className="block w-full rounded border border-zinc-200 dark:border-zinc-800 p-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div className="font-medium">{fix.description}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    slack Δ: +{fix.slackDelta.toFixed(3)} ns &middot; area Δ: +
                    {fix.ppaCost.area.toFixed(2)} &middot; power Δ: +
                    {fix.ppaCost.power.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 p-4">
            <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              Closed. final slack: {effectiveSlack.toFixed(3)} ns &middot;{" "}
              {commandCount} commands used
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            Command palette
          </div>
          <ul className="space-y-1 text-xs font-mono">
            {availableCommands.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setInput(c.usage.split(" ")[0])}
                  className="text-left hover:text-zinc-900 dark:hover:text-zinc-100 text-zinc-600 dark:text-zinc-400"
                  title={c.description}
                >
                  {c.id}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Tutor
            </div>
            <div className="text-xs text-zinc-500">{hintLevel}/3 hints</div>
          </div>
          {hintText && (
            <div className="mb-3 whitespace-pre-wrap rounded bg-zinc-50 dark:bg-zinc-900 p-2 text-xs">
              {hintText}
            </div>
          )}
          <button
            onClick={requestHint}
            disabled={hintLoading || hintLevel >= 3}
            className="w-full rounded border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
          >
            {hintLoading
              ? "..."
              : hintLevel === 0
                ? "nudge me"
                : hintLevel === 1
                  ? "give me a hint"
                  : hintLevel === 2
                    ? "walk me through it"
                    : "no more hints"}
          </button>
        </div>
      </aside>
    </div>
  );
}
