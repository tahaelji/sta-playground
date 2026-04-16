// Minimal fixture: two DFFs with a combinational path between them.
// Used by simulator tests. Delays in picoseconds for cell arcs and
// wire delays; clock period in ns.
//
//   clk --> [reg_a] --data--> [U1 NAND2] --> [U2 INV] --> [reg_b]
//
// A correctly sized version of this circuit meets setup; we author
// an undersized U2 variant in problem 01 to create a violation.

import type { Problem } from "../types";

export const twoFlopProblem: Problem = {
  id: "test-two-flop",
  title: "Two flop path",
  difficulty: "easy",
  tags: ["setup"],
  description: "test fixture",
  design: {
    name: "two_flop",
    cells: [
      {
        id: "reg_a",
        type: "DFFX1",
        isSequential: true,
        pins: [
          { id: "D", direction: "in", capacitance: 0.002 },
          { id: "Q", direction: "out" },
          { id: "CK", direction: "in", isClock: true, capacitance: 0.003 },
        ],
        arcs: [
          { from: "CK", to: "Q", delay: 150, sense: "positive_unate" },
          { from: "D", to: "D", delay: 80, sense: "non_unate", check: "setup" },
          { from: "D", to: "D", delay: 30, sense: "non_unate", check: "hold" },
        ],
      },
      {
        id: "U1",
        type: "NAND2X1",
        pins: [
          { id: "A", direction: "in", capacitance: 0.002 },
          { id: "B", direction: "in", capacitance: 0.002 },
          { id: "Y", direction: "out" },
        ],
        arcs: [
          { from: "A", to: "Y", delay: 120, sense: "negative_unate" },
          { from: "B", to: "Y", delay: 115, sense: "negative_unate" },
        ],
      },
      {
        id: "U2",
        type: "INVX1",
        pins: [
          { id: "A", direction: "in", capacitance: 0.002 },
          { id: "Y", direction: "out" },
        ],
        arcs: [{ from: "A", to: "Y", delay: 95, sense: "negative_unate" }],
      },
      {
        id: "reg_b",
        type: "DFFX1",
        isSequential: true,
        pins: [
          { id: "D", direction: "in", capacitance: 0.002 },
          { id: "Q", direction: "out" },
          { id: "CK", direction: "in", isClock: true, capacitance: 0.003 },
        ],
        arcs: [
          { from: "CK", to: "Q", delay: 150, sense: "positive_unate" },
          { from: "D", to: "D", delay: 80, sense: "non_unate", check: "setup" },
          { from: "D", to: "D", delay: 30, sense: "non_unate", check: "hold" },
        ],
      },
    ],
    nets: [
      {
        id: "n_q",
        driver: "reg_a/Q",
        loads: ["U1/A"],
        resistance: 50,
        capacitance: 0.01,
        wireDelay: 25,
      },
      {
        id: "n_b_high",
        driver: "tieH/Y",
        loads: ["U1/B"],
        wireDelay: 0,
      },
      {
        id: "n_y1",
        driver: "U1/Y",
        loads: ["U2/A"],
        resistance: 60,
        capacitance: 0.012,
        wireDelay: 30,
      },
      {
        id: "n_y2",
        driver: "U2/Y",
        loads: ["reg_b/D"],
        resistance: 55,
        capacitance: 0.011,
        wireDelay: 28,
      },
      {
        id: "clk_net",
        driver: "clk",
        loads: ["reg_a/CK", "reg_b/CK"],
        wireDelay: 20,
      },
    ],
    clocks: [
      {
        id: "clk",
        period: 1.0,
        source: "clk",
        waveform: [0, 0.5],
        uncertainty: 0.05,
        latency: 0.1,
      },
    ],
    constraints: [
      { kind: "input_delay", clock: "clk", port: "reg_a/D", delay: 0.1 },
      { kind: "output_delay", clock: "clk", port: "reg_b/Q", delay: 0.1 },
    ],
    ports: [
      { id: "clk", direction: "in" },
    ],
  },
  reportedViolation: {
    type: "setup",
    startpoint: "reg_a/Q",
    endpoint: "reg_b/D",
    slack: -0.15,
    summary: "setup violation on reg_a -> reg_b path",
  },
  validCommands: [
    "report_timing",
    "report_clocks",
    "report_clock_network",
    "get_cells",
    "get_pins",
    "get_nets",
    "report_parasitics",
    "report_exceptions",
    "all_registers",
  ],
  solution: {
    rootCauseOptions: [
      { id: "rc1", label: "U2 undersized, driving heavy load", correct: true },
      { id: "rc2", label: "Clock skew too large", correct: false },
      { id: "rc3", label: "Missing false path", correct: false },
    ],
    acceptedFixes: [
      {
        id: "size_up_u2",
        description: "Size up U2 from INVX1 to INVX4",
        category: "size_up",
        ppaCost: { area: 0.05, power: 0.03, timing: -0.2 },
        slackDelta: 0.25,
      },
      {
        id: "buffer_n_y1",
        description: "Insert buffer on net n_y1",
        category: "buffer_insert",
        ppaCost: { area: 0.03, power: 0.02, timing: -0.1 },
        slackDelta: 0.12,
      },
    ],
  },
  hintTree: {
    nudge: "Which segment of the data path is contributing the most delay?",
    hint: "Look at the drive strength of cells feeding high-capacitance nets.",
    walkthrough:
      "Run report_timing from reg_a/Q to reg_b/D. Notice U2's INVX1 drives n_y2 with 0.011 pF load. Size U2 up to INVX4 or insert a buffer.",
  },
  steps: [
    {
      id: "s1",
      title: "Read the report",
      goal: "Understand the violation",
      suggestedCommands: ["report_timing -from reg_a/Q -to reg_b/D"],
      checkpoint: {
        question: "Is there a violation?",
        options: [
          { id: "a", label: "Yes", correct: true },
          { id: "b", label: "No", correct: false },
        ],
      },
      insight: "There is a setup violation.",
    },
  ],
};
