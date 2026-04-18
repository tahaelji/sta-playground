"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Problem, InvestigationStep } from "@/lib/sta/types";

type ConsoleLine =
  | { kind: "input"; text: string }
  | { kind: "output"; text: string }
  | { kind: "error"; text: string };

export default function Workspace({ problem }: { problem: Problem }) {
  const steps = problem.steps;
  const [currentStep, setCurrentStep] = useState(0);
  const [stepResults, setStepResults] = useState<Record<string, "correct" | "wrong">>({});
  const [stepInsights, setStepInsights] = useState<Record<string, boolean>>({});
  const [checkpointAnswer, setCheckpointAnswer] = useState<string | null>(null);

  const [lines, setLines] = useState<ConsoleLine[]>([
    { kind: "output", text: problem.reportedViolation.summary },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [commandCount, setCommandCount] = useState(0);

  const [stage, setStage] = useState<"steps" | "fix" | "done">("steps");
  const [chosenFix, setChosenFix] = useState<string | null>(null);
  const [effectiveSlack, setEffectiveSlack] = useState(
    problem.reportedViolation.slack,
  );

  const consoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
  }, [lines]);

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

  const step = steps[currentStep] as InvestigationStep | undefined;

  const submitCheckpoint = () => {
    if (!step || !checkpointAnswer) return;
    const opt = step.checkpoint.options.find((o) => o.id === checkpointAnswer);
    if (opt?.correct) {
      setStepResults((r) => ({ ...r, [step.id]: "correct" }));
      setStepInsights((r) => ({ ...r, [step.id]: true }));
    } else {
      setStepResults((r) => ({ ...r, [step.id]: "wrong" }));
    }
  };

  const advanceStep = () => {
    setCheckpointAnswer(null);
    if (currentStep < steps.length - 1) {
      setCurrentStep((n) => n + 1);
    } else {
      setStage("fix");
    }
  };

  const applyFix = (fixId: string) => {
    const fix = problem.solution.acceptedFixes.find((f) => f.id === fixId);
    if (!fix) return;
    setChosenFix(fixId);
    const newSlack = problem.reportedViolation.slack + fix.slackDelta;
    setEffectiveSlack(newSlack);
    setLines((ls) => [
      ...ls,
      { kind: "output", text: `applied: ${fix.description}` },
      { kind: "output", text: `new slack: ${newSlack.toFixed(3)} ns` },
    ]);
    setStage("done");
  };

  const stepsCompleted = Object.values(stepResults).filter((r) => r === "correct").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* LEFT: console + step content */}
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold mb-2">{problem.title}</h1>
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{problem.difficulty}</span>
          {problem.tags.map((t) => (
            <span key={t} className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{t}</span>
          ))}
          <span className="ml-auto">{commandCount} commands</span>
        </div>

        <details className="mb-6 group" open>
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 select-none">
            <span className="group-open:hidden">Show problem description</span>
            <span className="hidden group-open:inline">Hide problem description</span>
          </summary>
          <article className="mt-3 max-w-none whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {problem.description}
          </article>
        </details>

        {/* console */}
        <div className="mb-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Console</div>
          <div
            ref={consoleRef}
            className="h-[calc(100vh-280px)] min-h-[400px] overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-3 font-mono text-xs"
          >
            {lines.map((l, i) => (
              <pre
                key={i}
                className={
                  l.kind === "input"
                    ? "text-emerald-400"
                    : l.kind === "error"
                      ? "text-red-400"
                      : "text-zinc-100"
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
              placeholder="type a command or click a suggested one →"
              className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-xs"
            />
            <button
              type="submit"
              disabled={busy || !input.trim() || stage === "done"}
              className="rounded bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              run
            </button>
          </form>
        </div>

        {/* fix selection */}
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
                    slack +{fix.slackDelta.toFixed(3)} ns · area +{fix.ppaCost.area.toFixed(2)} · power +{fix.ppaCost.power.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 p-4">
            <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              Timing closed. Final slack: {effectiveSlack.toFixed(3)} ns · {commandCount} commands · {stepsCompleted}/{steps.length} steps correct on first try
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: investigation steps timeline */}
      <aside className="space-y-0">
        <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
          Investigation ({stepsCompleted}/{steps.length})
        </div>

        {/* step timeline */}
        <div className="space-y-0">
          {steps.map((s, i) => {
            const isCurrent = i === currentStep && stage === "steps";
            const isDone = stepResults[s.id] === "correct";
            const isFuture = i > currentStep || (i === currentStep && stage !== "steps");
            const isLocked = stage !== "steps" || i > currentStep;

            return (
              <div key={s.id} className="relative pl-7">
                {/* timeline line */}
                {i < steps.length - 1 && (
                  <div
                    className={`absolute left-[11px] top-6 w-px h-full ${
                      isDone ? "bg-emerald-400" : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  />
                )}
                {/* timeline dot */}
                <div
                  className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 ring-2 ring-zinc-400"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </div>

                <div className={`pb-6 ${isFuture && !isDone ? "opacity-40" : ""}`}>
                  <div className="text-sm font-medium mb-1">{s.title}</div>

                  {isCurrent && (
                    <div className="space-y-3">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{s.goal}</p>

                      {/* suggested commands */}
                      {s.suggestedCommands.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Try these</div>
                          <div className="flex flex-col gap-1">
                            {s.suggestedCommands.map((cmd) => (
                              <button
                                key={cmd}
                                onClick={() => { setInput(cmd); runCommand(cmd); }}
                                disabled={busy}
                                className="w-full text-left rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
                              >
                                {cmd}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* checkpoint */}
                      {!isDone && (
                        <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                          <div className="text-xs font-medium mb-2">{s.checkpoint.question}</div>
                          <div className="space-y-1.5">
                            {s.checkpoint.options.map((opt) => {
                              const wasWrong =
                                stepResults[s.id] === "wrong" &&
                                checkpointAnswer === opt.id;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                                    wasWrong ? "bg-red-50 dark:bg-red-950" : ""
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`ckpt-${s.id}`}
                                    checked={checkpointAnswer === opt.id}
                                    onChange={() => {
                                      setCheckpointAnswer(opt.id);
                                      setStepResults((r) => {
                                        const copy = { ...r };
                                        delete copy[s.id];
                                        return copy;
                                      });
                                    }}
                                    className="mt-0.5"
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          {stepResults[s.id] === "wrong" && (
                            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                              Not quite — re-read the console output and try again.
                            </div>
                          )}
                          <button
                            onClick={submitCheckpoint}
                            disabled={!checkpointAnswer}
                            className="mt-3 w-full rounded bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
                          >
                            check
                          </button>
                        </div>
                      )}

                      {/* insight after correct answer */}
                      {stepInsights[s.id] && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Insight</div>
                          <p className="text-xs text-emerald-900 dark:text-emerald-100">{s.insight}</p>
                          <button
                            onClick={advanceStep}
                            className="mt-3 w-full rounded border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                          >
                            {currentStep < steps.length - 1 ? "next step →" : "choose a fix →"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* completed step summary */}
                  {isDone && !isCurrent && (
                    <p className="text-xs text-zinc-500 italic">{s.insight}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
