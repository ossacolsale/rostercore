export type Selector = {
  employeeIds?: string[];
  typeIds?: string[];
  groupIds?: string[];
  attributes?: Record<string, string | number | boolean>;
};
export type Scope = {
  start?: string;
  end?: string;
  weekdays?: number[];
  excludedDates?: string[];
};
export type Expression =
  | {
      op: "COUNT";
      selector: Selector;
      shiftId: string;
      comparison: "EQ" | "GE" | "LE";
      count: number;
    }
  | { op: "REMAINING"; selector: Selector; shiftId: string }
  | { op: "AND"; children: Expression[] }
  | { op: "OR"; children: Expression[] };
export type Constraint = {
  id: string;
  label?: string;
  scope?: Scope;
  expression: Expression;
};
export type Objective = {
  id: string;
  label?: string;
  type: "CUMULATIVE_FAIRNESS";
  mode: "CONTINUOUS_BALANCED";
  measure: "COUNT";
  selector: Selector;
  shiftIds: string[];
  participation: "EQUAL" | "AVAILABILITY_WEIGHTED" | "CUSTOM_WEIGHTED";
  weights?: Record<string, number>;
  metrics: string[];
  priority: number;
  scope?: Scope;
};
export type Policy = {
  id: string;
  label: string;
  revision: number;
  active: boolean;
  draft: boolean;
  dependencies: { symbol: string; kind: string }[];
  objective: Objective;
  constraints: Constraint[];
  sharedConstraintIds: string[];
  constraintSetIds: string[];
  scope?: Scope;
};
export type Assignment = { employeeId: string; date: string; shiftId: string };
export type Scenario = {
  format: "rostercore.scenario";
  schemaVersion: 1;
  id: string;
  label: string;
  revision: number;
  employeeTypes: { id: string; label: string }[];
  employees: {
    id: string;
    label: string;
    typeId: string;
    attributes: Record<string, string | number | boolean>;
  }[];
  groups: { id: string; label: string; selector: Selector }[];
  shifts: {
    id: string;
    label: string;
    kind: "WORKING" | "OFF";
    intervals: { start: string; end: string; endDayOffset: number }[];
  }[];
  calendar: {
    start: string;
    end: string;
    timezone: string;
    excludedDates: string[];
    excludedRanges: { start: string; end: string }[];
    excludedIsoWeeks: string[];
  };
  availability: {
    id: string;
    selector: Selector;
    scope: Scope;
    state: "ABSENT";
  }[];
  allowedShifts: {
    id: string;
    selector: Selector;
    scope: Scope;
    shiftIds: string[];
  }[];
  constraints: Constraint[];
  baseConstraintIds: string[];
  constraintSets: { id: string; label: string; constraintIds: string[] }[];
  policies: Policy[];
  history: {
    assignments: Assignment[];
    fairnessSnapshots: unknown[];
    through?: string;
  };
  publishedAssignments: Assignment[];
  hrState: { events: unknown[]; snapshotRevisions: Record<string, number> };
  search: {
    maxTimeSeconds: number;
    seed: number;
    workers: number;
    deterministic: boolean;
  };
};
export type Rational = { numerator: number; denominator: number };
export type Balance = {
  employeeId: string;
  initialActual: number;
  initialIdeal: Rational;
  initialDebt: Rational;
  actual: number;
  ideal: Rational;
  debt: Rational;
};
export type Result = {
  status: string;
  diagnostics: { code: string; path: string; message: string }[];
  assignments?: Assignment[];
  calendarStates?: { employeeId: string; date: string; state: string }[];
  fairness?: {
    policyId: string;
    objectiveId: string;
    employees: Balance[];
    prefixes: { date: string; employees: Balance[] }[];
    metrics: Record<string, Rational>;
  }[];
  metadata?: {
    engineVersion: string;
    backendVersion: string;
    configurationHash: string;
    elapsedSeconds: number;
  };
  phases?: {
    policyId: string;
    metric: string;
    status: string;
    value?: Rational;
    bestBoundScaled?: number;
    scale?: number;
  }[];
  scenario?: Scenario;
  preview?: unknown;
  context?: unknown;
};
export const metrics = [
  "MAX_ABSOLUTE_PREFIX_DEVIATION",
  "SUM_ABSOLUTE_PREFIX_DEVIATIONS",
  "FINAL_ABSOLUTE_DEVIATION",
];
export const metricNames: Record<string, string> = {
  MAX_ABSOLUTE_PREFIX_DEVIATION: "Worst prefix debt",
  SUM_ABSOLUTE_PREFIX_DEVIATIONS: "Total prefix debt",
  FINAL_ABSOLUTE_DEVIATION: "Final residual debt",
};
export const id = (prefix = "item") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const rational = (r?: Rational) => (r ? r.numerator / r.denominator : 0);
export const exact = (r?: Rational) =>
  !r
    ? "—"
    : r.denominator === 1
      ? String(r.numerator)
      : `${r.numerator}/${r.denominator}`;
export const newAtom = (s: Scenario): Expression => ({
  op: "COUNT",
  selector: {},
  shiftId: s.shifts[0]?.id || "",
  comparison: "EQ",
  count: 1,
});
export const newConstraint = (s: Scenario): Constraint => ({
  id: id("rule"),
  label: "Staffing requirement",
  scope: {},
  expression: newAtom(s),
});
export const newPolicy = (s: Scenario): Policy => ({
  id: id("policy"),
  label: "Balanced duty rotation",
  revision: 1,
  active: true,
  draft: false,
  dependencies: [],
  objective: {
    id: id("objective"),
    label: "Duty fairness",
    type: "CUMULATIVE_FAIRNESS",
    mode: "CONTINUOUS_BALANCED",
    measure: "COUNT",
    selector: {},
    shiftIds: [
      s.shifts.find((x) => x.kind === "WORKING")?.id || s.shifts[0]?.id || "",
    ],
    participation: "EQUAL",
    metrics: [...metrics],
    priority: s.policies.length,
  },
  constraints: [],
  sharedConstraintIds: [],
  constraintSetIds: [],
});
export function dates(start: string, end: string) {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00Z"),
    last = new Date(end + "T12:00:00Z");
  for (let i = 0; i < 366 && d <= last; i++, d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10));
  return out;
}
export function download(name: string, value: unknown) {
  const data =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
