import { describe, it, expect } from "vitest";
import {
  createContext,
  runCommand,
  applyFix,
  effectiveSlack,
  computePath,
} from "../simulator";
import { parseCommand } from "../commands";
import { twoFlopProblem } from "./fixtures";

describe("parseCommand", () => {
  it("parses flags with values", () => {
    const res = parseCommand("report_timing -from reg_a/Q -to reg_b/D");
    expect(res).toEqual({
      command: "report_timing",
      args: { from: "reg_a/Q", to: "reg_b/D" },
    });
  });

  it("rejects unknown commands", () => {
    expect(parseCommand("foo")).toEqual({ error: "unknown command: foo" });
  });

  it("parses quoted values", () => {
    const res = parseCommand('get_cells -pattern "reg_*"');
    expect(res).toEqual({ command: "get_cells", args: { pattern: "reg_*" } });
  });
});

describe("path finding", () => {
  it("walks combinational path between flops", () => {
    const ctx = createContext(twoFlopProblem);
    const path = computePath(ctx.design, "reg_a/Q", "reg_b/D");
    expect(path).not.toBeNull();
    expect(path!.segments.length).toBeGreaterThan(0);
    expect(path!.segments.some((s) => s.description.includes("U1"))).toBe(true);
    expect(path!.segments.some((s) => s.description.includes("U2"))).toBe(true);
  });
});

describe("runCommand", () => {
  it("rejects commands not in validCommands", () => {
    const ctx = createContext({
      ...twoFlopProblem,
      validCommands: ["report_clocks"],
    });
    const out = runCommand(ctx, { command: "report_timing", args: {} });
    expect(out).toMatch(/not available/);
  });

  it("report_timing shows slack", () => {
    const ctx = createContext(twoFlopProblem);
    const out = runCommand(ctx, {
      command: "report_timing",
      args: { from: "reg_a/Q", to: "reg_b/D" },
    });
    expect(out).toMatch(/slack/);
    expect(out).toMatch(/VIOLATED/);
  });

  it("report_clocks lists clk", () => {
    const ctx = createContext(twoFlopProblem);
    const out = runCommand(ctx, { command: "report_clocks", args: {} });
    expect(out).toMatch(/clk/);
  });

  it("get_cells filters by pattern", () => {
    const ctx = createContext(twoFlopProblem);
    const out = runCommand(ctx, { command: "get_cells", args: { pattern: "reg_*" } });
    expect(out).toMatch(/reg_a/);
    expect(out).toMatch(/reg_b/);
    expect(out).not.toMatch(/\bU1\b/);
  });

  it("report_parasitics returns net R/C", () => {
    const ctx = createContext(twoFlopProblem);
    const out = runCommand(ctx, { command: "report_parasitics", args: { net: "n_y2" } });
    expect(out).toMatch(/n_y2/);
    expect(out).toMatch(/0\.011/);
  });
});

describe("fix application", () => {
  it("applies fix and improves effective slack", () => {
    const ctx0 = createContext(twoFlopProblem);
    expect(effectiveSlack(ctx0)).toBeCloseTo(-0.15, 5);
    const ctx1 = applyFix(ctx0, "size_up_u2");
    expect(effectiveSlack(ctx1)).toBeCloseTo(0.10, 5);
  });

  it("no-ops on unknown fix id", () => {
    const ctx0 = createContext(twoFlopProblem);
    const ctx1 = applyFix(ctx0, "nonexistent");
    expect(effectiveSlack(ctx1)).toBeCloseTo(-0.15, 5);
  });
});
