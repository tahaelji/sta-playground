// Command palette. Each entry mirrors a real PrimeTime / OpenSTA command
// at a high level — the simulator interprets these against the problem's
// backing graph and returns formatted output.

export type CommandArg = {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  description: string;
};

export interface CommandDef {
  id: string;
  usage: string;
  description: string;
  args: CommandArg[];
}

export const COMMANDS: Record<string, CommandDef> = {
  report_timing: {
    id: "report_timing",
    usage: "report_timing [-from <pin>] [-to <pin>] [-delay_type max|min] [-path_type full]",
    description:
      "Report the worst timing path matching the filter. Shows launch and capture clock edges, cell delays, net delays, required vs arrival, and slack.",
    args: [
      { name: "from", type: "string", description: "Startpoint pin/port" },
      { name: "to", type: "string", description: "Endpoint pin/port" },
      { name: "delay_type", type: "string", description: "max (setup) or min (hold)" },
    ],
  },
  report_clocks: {
    id: "report_clocks",
    usage: "report_clocks",
    description: "List all defined clocks with period, waveform, uncertainty, and source.",
    args: [],
  },
  report_clock_network: {
    id: "report_clock_network",
    usage: "report_clock_network [-clock <name>]",
    description:
      "Show the clock distribution network: buffers, skew at each sink, insertion delay. Useful for diagnosing clock skew issues.",
    args: [{ name: "clock", type: "string", description: "Clock name to inspect" }],
  },
  get_cells: {
    id: "get_cells",
    usage: "get_cells [-pattern <glob>] [-hierarchical]",
    description: "List cells matching a pattern. Returns cell type, area, leakage.",
    args: [{ name: "pattern", type: "string", description: "Glob pattern (e.g. reg_*)" }],
  },
  get_pins: {
    id: "get_pins",
    usage: "get_pins [-of_objects <cell>] [-pattern <glob>]",
    description: "List pins on a cell or matching a pattern. Shows direction, capacitance.",
    args: [
      { name: "of_objects", type: "string", description: "Cell id to list pins for" },
      { name: "pattern", type: "string", description: "Glob pattern" },
    ],
  },
  get_nets: {
    id: "get_nets",
    usage: "get_nets [-pattern <glob>]",
    description: "List nets with driver, loads, and parasitic R/C.",
    args: [{ name: "pattern", type: "string", description: "Glob pattern" }],
  },
  report_parasitics: {
    id: "report_parasitics",
    usage: "report_parasitics -net <name>",
    description: "Show RC parasitics and wire delay for a specific net.",
    args: [{ name: "net", type: "string", required: true, description: "Net name" }],
  },
  report_exceptions: {
    id: "report_exceptions",
    usage: "report_exceptions",
    description: "List active timing exceptions: false_path, multicycle_path, max/min_delay.",
    args: [],
  },
  all_registers: {
    id: "all_registers",
    usage: "all_registers [-clock <name>]",
    description: "List all sequential cells, optionally filtered by clock domain.",
    args: [{ name: "clock", type: "string", description: "Clock name" }],
  },
};

export type CommandInvocation = {
  command: string;
  args: Record<string, string | number | boolean>;
};

export function parseCommand(line: string): CommandInvocation | { error: string } {
  const trimmed = line.trim();
  if (!trimmed) return { error: "empty command" };
  const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const command = tokens[0];
  if (!command) return { error: "empty command" };
  const def = COMMANDS[command];
  if (!def) return { error: `unknown command: ${command}` };

  const args: Record<string, string | number | boolean> = {};
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      const name = t.slice(1);
      const next = tokens[i + 1];
      if (next === undefined || next.startsWith("-")) {
        args[name] = true;
        i += 1;
      } else {
        args[name] = next.replace(/^"|"$/g, "");
        i += 2;
      }
    } else {
      i += 1;
    }
  }
  return { command, args };
}
