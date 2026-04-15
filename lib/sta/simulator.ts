// Simulated STA engine. Pure functions over a Problem's Design graph.
// Deliberately simpler than real PrimeTime/OpenSTA: we don't model
// transition times, slew propagation, or full waveform analysis. We
// compute cell arc delays + lumped wire delays + clock edge times,
// which is sufficient for pedagogy on setup/hold/skew/false-path problems.

import type {
  Problem,
  Design,
  Cell,
  Net,
  Clock,
  Pin,
  AcceptedFix,
  CheckType,
} from "./types";
import { COMMANDS, type CommandInvocation } from "./commands";

// ---------- Context ----------

export interface StaContext {
  problem: Problem;
  design: Design;                // possibly modified by fixes
  appliedFixes: string[];        // fix ids in application order
}

export function createContext(problem: Problem): StaContext {
  return {
    problem,
    design: structuredClone(problem.design),
    appliedFixes: [],
  };
}

// ---------- Graph helpers ----------

function cellById(design: Design, id: string): Cell | undefined {
  return design.cells.find((c) => c.id === id);
}

function netByPin(design: Design, pinId: string): Net | undefined {
  return design.nets.find(
    (n) => n.driver === pinId || n.loads.includes(pinId),
  );
}

function pinOf(cell: Cell, pinId: string): Pin | undefined {
  const bare = pinId.includes("/") ? pinId.split("/")[1] : pinId;
  return cell.pins.find((p) => p.id === pinId || p.id === bare);
}

function splitPin(pinId: string): { cellId: string; pin: string } {
  const [cellId, pin] = pinId.split("/");
  return { cellId, pin };
}

// ---------- Path finding ----------

export interface PathSegment {
  kind: "cell_arc" | "net" | "clock";
  from: string;
  to: string;
  delay: number;              // ns
  description: string;
}

export interface TimingPath {
  startpoint: string;
  endpoint: string;
  launchClock?: Clock;
  captureClock?: Clock;
  segments: PathSegment[];
  dataArrival: number;        // ns
  dataRequired: number;       // ns
  slack: number;              // ns
  checkType: CheckType;
}

// Walk the combinational graph from a driver pin to a target endpoint pin.
// Returns the first path found (DFS). Good enough for MVP problems where
// there's typically one dominant path between any startpoint/endpoint.
function walkCombinational(
  design: Design,
  startPinId: string,
  endPinId: string,
  visited = new Set<string>(),
): PathSegment[] | null {
  if (startPinId === endPinId) return [];
  if (visited.has(startPinId)) return null;
  visited.add(startPinId);

  const net = netByPin(design, startPinId);
  if (!net || net.driver !== startPinId) return null;

  for (const loadPinId of net.loads) {
    const netDelay = net.wireDelay ?? 0;
    const netSeg: PathSegment = {
      kind: "net",
      from: startPinId,
      to: loadPinId,
      delay: netDelay / 1000,            // wire delay stored in ps
      description: `net ${net.id}`,
    };

    if (loadPinId === endPinId) {
      return [netSeg];
    }

    const { cellId } = splitPin(loadPinId);
    const cell = cellById(design, cellId);
    if (!cell || cell.isSequential) continue;

    for (const arc of cell.arcs) {
      const arcFromPin = `${cellId}/${arc.from}`;
      const arcToPin = `${cellId}/${arc.to}`;
      if (arcFromPin !== loadPinId) continue;

      const arcSeg: PathSegment = {
        kind: "cell_arc",
        from: arcFromPin,
        to: arcToPin,
        delay: arc.delay / 1000,
        description: `${cell.type} ${cell.id} (${arc.from} -> ${arc.to})`,
      };

      const rest = walkCombinational(design, arcToPin, endPinId, visited);
      if (rest) return [netSeg, arcSeg, ...rest];
    }
  }
  return null;
}

// Walk the clock network from clock source to a sequential cell's clock pin,
// summing buffer arcs and net delays. Returns total insertion delay (ns).
function clockArrivalAt(design: Design, clock: Clock, sinkCellId: string): number {
  const sinkCell = cellById(design, sinkCellId);
  if (!sinkCell) return 0;
  const ckPin = sinkCell.pins.find((p) => p.isClock);
  if (!ckPin) return 0;
  const target = `${sinkCellId}/${ckPin.id.split("/").pop()}`;

  const path = walkCombinational(design, clock.source, target);
  if (!path) return clock.latency ?? 0;
  const delay = path.reduce((sum, s) => sum + s.delay, 0);
  return delay + (clock.latency ?? 0);
}

// ---------- Timing check ----------

export function computePath(
  design: Design,
  fromPin: string,
  toPin: string,
  checkType: CheckType = "setup",
): TimingPath | null {
  const segments = walkCombinational(design, fromPin, toPin);
  if (!segments) return null;

  const { cellId: startCellId } = splitPin(fromPin);
  const { cellId: endCellId } = splitPin(toPin);
  const startCell = cellById(design, startCellId);
  const endCell = cellById(design, endCellId);

  // Naive single-clock assumption for MVP.
  const launchClock = design.clocks[0];
  const captureClock = design.clocks[0];

  const launchEdge = launchClock ? clockArrivalAt(design, launchClock, startCellId) : 0;
  const captureEdge = captureClock
    ? clockArrivalAt(design, captureClock, endCellId) + captureClock.period
    : 0;

  const clkQ =
    startCell?.arcs.find((a) => a.sense === "positive_unate" && a.check === undefined)?.delay ?? 0;
  const dataPath = segments.reduce((sum, s) => sum + s.delay, 0);
  const dataArrival = launchEdge + clkQ / 1000 + dataPath;

  const setupTime =
    endCell?.arcs.find((a) => a.check === "setup")?.delay ?? 0;
  const uncertainty = captureClock?.uncertainty ?? 0;

  let dataRequired: number;
  if (checkType === "setup") {
    dataRequired = captureEdge - setupTime / 1000 - uncertainty;
  } else {
    const holdTime = endCell?.arcs.find((a) => a.check === "hold")?.delay ?? 0;
    dataRequired = (captureClock ? clockArrivalAt(design, captureClock, endCellId) : 0)
      + holdTime / 1000
      + uncertainty;
  }

  const slack = checkType === "setup"
    ? dataRequired - dataArrival
    : dataArrival - dataRequired;

  return {
    startpoint: fromPin,
    endpoint: toPin,
    launchClock,
    captureClock,
    segments,
    dataArrival,
    dataRequired,
    slack,
    checkType,
  };
}

// ---------- Fix application ----------

export function applyFix(ctx: StaContext, fixId: string): StaContext {
  const fix = ctx.problem.solution.acceptedFixes.find((f) => f.id === fixId);
  if (!fix) return ctx;
  // MVP: fixes are modeled as a scalar slack delta applied to the reported
  // violation. When we integrate real OpenSTA (v2) this becomes a real
  // mutation of the design graph.
  return {
    ...ctx,
    appliedFixes: [...ctx.appliedFixes, fixId],
  };
}

export function effectiveSlack(ctx: StaContext): number {
  const base = ctx.problem.reportedViolation.slack;
  const delta = ctx.appliedFixes.reduce((sum, fid) => {
    const fix = ctx.problem.solution.acceptedFixes.find((f) => f.id === fid);
    return sum + (fix?.slackDelta ?? 0);
  }, 0);
  return base + delta;
}

// ---------- Command dispatch ----------

export function runCommand(ctx: StaContext, inv: CommandInvocation): string {
  if (!ctx.problem.validCommands.includes(inv.command)) {
    return `Error: command "${inv.command}" is not available for this problem.`;
  }
  const def = COMMANDS[inv.command];
  if (!def) return `Error: unknown command "${inv.command}".`;

  switch (inv.command) {
    case "report_timing":
      return formatReportTiming(ctx, inv.args);
    case "report_clocks":
      return formatReportClocks(ctx);
    case "report_clock_network":
      return formatClockNetwork(ctx, inv.args);
    case "get_cells":
      return formatGetCells(ctx, inv.args);
    case "get_pins":
      return formatGetPins(ctx, inv.args);
    case "get_nets":
      return formatGetNets(ctx, inv.args);
    case "report_parasitics":
      return formatReportParasitics(ctx, inv.args);
    case "report_exceptions":
      return formatReportExceptions(ctx);
    case "all_registers":
      return formatAllRegisters(ctx, inv.args);
    default:
      return `Error: command "${inv.command}" is defined but has no formatter.`;
  }
}

// ---------- Formatters (PrimeTime-flavored text output) ----------

const pad = (s: string, n: number) => s.padEnd(n);
const fmt = (n: number, d = 3) => n.toFixed(d);

function formatReportTiming(ctx: StaContext, args: Record<string, unknown>): string {
  const v = ctx.problem.reportedViolation;
  const from = (args.from as string) ?? v.startpoint;
  const to = (args.to as string) ?? v.endpoint;
  const checkType: CheckType = (args.delay_type === "min" ? "hold" : "setup");

  const path = computePath(ctx.design, from, to, checkType);
  const baseSlack = effectiveSlack(ctx);

  const header = [
    "****************************************",
    `Report   : timing`,
    `           -delay_type ${checkType === "setup" ? "max" : "min"}`,
    `           -from ${from}`,
    `           -to ${to}`,
    `Design   : ${ctx.design.name}`,
    "****************************************",
    "",
    `Startpoint: ${from}`,
    `Endpoint:   ${to}`,
    `Path Group: ${path?.launchClock?.id ?? "**default**"}`,
    `Path Type:  ${checkType === "setup" ? "max" : "min"}`,
    "",
  ];

  if (!path) {
    return [
      ...header,
      "(path not found by simulator — showing reported slack only)",
      "",
      `slack (${baseSlack >= 0 ? "MET" : "VIOLATED"})    ${fmt(baseSlack)}`,
    ].join("\n");
  }

  const rows: string[] = [
    `  ${pad("Point", 40)}  ${pad("Incr", 10)}  ${pad("Path", 10)}`,
    `  ${"-".repeat(40)}  ${"-".repeat(10)}  ${"-".repeat(10)}`,
  ];
  let running = path.launchClock ? clockArrivalAt(ctx.design, path.launchClock, splitPin(from).cellId) : 0;
  rows.push(`  ${pad("clock " + (path.launchClock?.id ?? ""), 40)}  ${pad(fmt(running), 10)}  ${pad(fmt(running), 10)} r`);
  rows.push(`  ${pad(from + " (launch)", 40)}  ${pad(fmt(0), 10)}  ${pad(fmt(running), 10)} r`);
  for (const seg of path.segments) {
    running += seg.delay;
    rows.push(`  ${pad(seg.description, 40)}  ${pad(fmt(seg.delay), 10)}  ${pad(fmt(running), 10)}`);
  }
  rows.push("");
  rows.push(`  ${pad("data arrival time", 40)}  ${" ".repeat(10)}  ${pad(fmt(path.dataArrival), 10)}`);
  rows.push("");
  rows.push(`  ${pad("data required time", 40)}  ${" ".repeat(10)}  ${pad(fmt(path.dataRequired), 10)}`);
  rows.push(`  ${pad("slack (" + (baseSlack >= 0 ? "MET" : "VIOLATED") + ")", 40)}  ${" ".repeat(10)}  ${pad(fmt(baseSlack), 10)}`);

  return [...header, ...rows].join("\n");
}

function formatReportClocks(ctx: StaContext): string {
  const rows = [
    `${pad("Clock", 16)}  ${pad("Period", 10)}  ${pad("Waveform", 16)}  ${pad("Uncertainty", 12)}  Source`,
    "-".repeat(80),
  ];
  for (const c of ctx.design.clocks) {
    rows.push(
      `${pad(c.id, 16)}  ${pad(fmt(c.period), 10)}  ${pad(`{${c.waveform?.[0] ?? 0} ${c.waveform?.[1] ?? c.period / 2}}`, 16)}  ${pad(fmt(c.uncertainty ?? 0), 12)}  ${c.source}`,
    );
  }
  return rows.join("\n");
}

function formatClockNetwork(ctx: StaContext, args: Record<string, unknown>): string {
  const clockId = (args.clock as string) ?? ctx.design.clocks[0]?.id;
  const clock = ctx.design.clocks.find((c) => c.id === clockId);
  if (!clock) return `Error: clock "${clockId}" not found.`;

  const sinks = ctx.design.cells.filter((c) => c.isSequential);
  const rows = [
    `Clock network for: ${clock.id}`,
    `Source: ${clock.source}    Period: ${fmt(clock.period)} ns`,
    "",
    `${pad("Sink", 24)}  ${pad("Insertion", 12)}  Skew vs min`,
    "-".repeat(60),
  ];
  const delays = sinks.map((s) => ({ id: s.id, d: clockArrivalAt(ctx.design, clock, s.id) }));
  const minDelay = Math.min(...delays.map((d) => d.d));
  for (const { id, d } of delays) {
    rows.push(`${pad(id, 24)}  ${pad(fmt(d), 12)}  ${fmt(d - minDelay)}`);
  }
  return rows.join("\n");
}

function globMatch(pattern: string | undefined, value: string): boolean {
  if (!pattern) return true;
  const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return re.test(value);
}

function formatGetCells(ctx: StaContext, args: Record<string, unknown>): string {
  const pat = args.pattern as string | undefined;
  const matches = ctx.design.cells.filter((c) => globMatch(pat, c.id));
  if (matches.length === 0) return "(no cells matched)";
  const rows = [`${pad("Cell", 20)}  ${pad("Type", 16)}  ${pad("Area", 10)}  Seq?`, "-".repeat(60)];
  for (const c of matches) {
    rows.push(
      `${pad(c.id, 20)}  ${pad(c.type, 16)}  ${pad(fmt(c.area ?? 0, 2), 10)}  ${c.isSequential ? "yes" : "no"}`,
    );
  }
  return rows.join("\n");
}

function formatGetPins(ctx: StaContext, args: Record<string, unknown>): string {
  const of = args.of_objects as string | undefined;
  const pat = args.pattern as string | undefined;
  const cells = of ? ctx.design.cells.filter((c) => c.id === of) : ctx.design.cells;
  const rows = [`${pad("Pin", 28)}  ${pad("Dir", 6)}  Cap (pF)`, "-".repeat(50)];
  let count = 0;
  for (const c of cells) {
    for (const p of c.pins) {
      const fullId = `${c.id}/${p.id.split("/").pop()}`;
      if (!globMatch(pat, fullId)) continue;
      rows.push(`${pad(fullId, 28)}  ${pad(p.direction, 6)}  ${fmt(p.capacitance ?? 0, 3)}`);
      count++;
    }
  }
  return count === 0 ? "(no pins matched)" : rows.join("\n");
}

function formatGetNets(ctx: StaContext, args: Record<string, unknown>): string {
  const pat = args.pattern as string | undefined;
  const matches = ctx.design.nets.filter((n) => globMatch(pat, n.id));
  if (matches.length === 0) return "(no nets matched)";
  const rows = [
    `${pad("Net", 16)}  ${pad("Driver", 20)}  ${pad("#Loads", 8)}  ${pad("R (ohm)", 10)}  ${pad("C (pF)", 10)}`,
    "-".repeat(72),
  ];
  for (const n of matches) {
    rows.push(
      `${pad(n.id, 16)}  ${pad(n.driver, 20)}  ${pad(String(n.loads.length), 8)}  ${pad(fmt(n.resistance ?? 0, 1), 10)}  ${pad(fmt(n.capacitance ?? 0, 3), 10)}`,
    );
  }
  return rows.join("\n");
}

function formatReportParasitics(ctx: StaContext, args: Record<string, unknown>): string {
  const name = args.net as string | undefined;
  if (!name) return "Error: -net is required.";
  const net = ctx.design.nets.find((n) => n.id === name);
  if (!net) return `Error: net "${name}" not found.`;
  return [
    `Net: ${net.id}`,
    `Driver: ${net.driver}`,
    `Loads:  ${net.loads.join(", ")}`,
    `R: ${fmt(net.resistance ?? 0, 2)} ohm`,
    `C: ${fmt(net.capacitance ?? 0, 3)} pF`,
    `Wire delay: ${fmt((net.wireDelay ?? 0) / 1000, 3)} ns`,
  ].join("\n");
}

function formatReportExceptions(ctx: StaContext): string {
  const cs = ctx.design.constraints.filter(
    (c) =>
      c.kind === "false_path" ||
      c.kind === "multicycle_path" ||
      c.kind === "max_delay" ||
      c.kind === "min_delay",
  );
  if (cs.length === 0) return "(no timing exceptions defined)";
  return cs
    .map((c) => {
      switch (c.kind) {
        case "false_path":
          return `false_path  from=${c.from ?? "*"}  to=${c.to ?? "*"}  through=${c.through ?? "-"}`;
        case "multicycle_path":
          return `multicycle_path cycles=${c.cycles} from=${c.from ?? "*"} to=${c.to ?? "*"}${c.hold ? " -hold" : ""}`;
        case "max_delay":
          return `max_delay ${c.delay} ns  from=${c.from ?? "*"} to=${c.to ?? "*"}`;
        case "min_delay":
          return `min_delay ${c.delay} ns  from=${c.from ?? "*"} to=${c.to ?? "*"}`;
      }
    })
    .join("\n");
}

function formatAllRegisters(ctx: StaContext, args: Record<string, unknown>): string {
  const clock = args.clock as string | undefined;
  const regs = ctx.design.cells.filter((c) => c.isSequential);
  const filtered = clock
    ? regs.filter(() => ctx.design.clocks.some((cl) => cl.id === clock))
    : regs;
  if (filtered.length === 0) return "(no registers)";
  return filtered.map((r) => `${r.id}  (${r.type})`).join("\n");
}

// Re-exports so tests and API routes can use these.
export { COMMANDS, type CommandInvocation } from "./commands";
export type { AcceptedFix };
