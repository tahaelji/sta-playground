// Core STA data model. Deliberately simplified from real Liberty/SDC but
// keeps the concepts that matter for pedagogy: cells with timing arcs,
// nets with parasitics, clocks with periods, and SDC-style constraints.

export type PinDirection = "in" | "out" | "inout";
export type TimingSense = "positive_unate" | "negative_unate" | "non_unate";
export type CheckType = "setup" | "hold" | "recovery" | "removal";

export interface Pin {
  id: string;              // e.g. "U1/A", "reg_q/D"
  direction: PinDirection;
  isClock?: boolean;       // true for DFF CK pin, clock port, etc.
  capacitance?: number;    // input pin load (pF)
}

export interface TimingArc {
  from: string;            // pin id on this cell
  to: string;              // pin id on this cell
  delay: number;           // ps, cell intrinsic delay
  sense: TimingSense;
  check?: CheckType;       // for setup/hold arcs on sequential cells
}

export interface Cell {
  id: string;              // instance name, e.g. "U1", "reg_q"
  type: string;            // liberty cell type, e.g. "DFFRX1", "NAND2X2"
  isSequential?: boolean;
  pins: Pin[];
  arcs: TimingArc[];
  area?: number;
  leakagePower?: number;
}

export interface Net {
  id: string;              // net name, e.g. "n42", "data_in"
  driver: string;          // pin id (cellId/pinId)
  loads: string[];         // pin ids
  resistance?: number;     // lumped R (ohms)
  capacitance?: number;    // lumped C (pF)
  wireDelay?: number;      // ps, precomputed RC delay at each load (simplified)
}

export interface Clock {
  id: string;              // e.g. "clk"
  period: number;          // ns
  source: string;          // pin id of clock port or generating cell
  waveform?: [number, number]; // rise, fall (ns)
  uncertainty?: number;    // ns, jitter + skew margin
  latency?: number;        // ns, insertion delay
}

export type Constraint =
  | { kind: "input_delay"; clock: string; port: string; delay: number }
  | { kind: "output_delay"; clock: string; port: string; delay: number }
  | { kind: "false_path"; from?: string; to?: string; through?: string }
  | { kind: "multicycle_path"; from?: string; to?: string; cycles: number; hold?: boolean }
  | { kind: "max_delay"; from?: string; to?: string; delay: number }
  | { kind: "min_delay"; from?: string; to?: string; delay: number };

export interface Design {
  name: string;
  cells: Cell[];
  nets: Net[];
  clocks: Clock[];
  constraints: Constraint[];
  ports: { id: string; direction: PinDirection }[];
}

export interface ReportedViolation {
  type: CheckType;
  startpoint: string;
  endpoint: string;
  slack: number;           // ns, negative = violation
  clockPath?: "launch" | "capture";
  summary: string;         // human-readable
}

export interface AcceptedFix {
  id: string;
  description: string;     // what the user did, e.g. "insert buffer on net n42"
  category: "size_up" | "size_down" | "buffer_insert" | "useful_skew" | "change_constraint" | "ecc_retime";
  ppaCost: { area: number; power: number; timing: number }; // relative deltas
  // The effect on slack when applied — simulator uses this to recompute report.
  slackDelta: number;      // ns
}

export interface HintTree {
  nudge: string;           // gentle push without naming the issue
  hint: string;            // explicit pointer to the investigation path
  walkthrough: string;     // step-by-step canonical solution
}

export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  tags: string[];
  description: string;     // markdown
  design: Design;
  reportedViolation: ReportedViolation;
  validCommands: string[]; // command ids permitted for this problem
  solution: {
    rootCauseOptions: { id: string; label: string; correct: boolean }[];
    acceptedFixes: AcceptedFix[];
  };
  hintTree: HintTree;
}
