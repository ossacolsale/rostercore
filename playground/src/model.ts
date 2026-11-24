import type { ScheduleArchive } from "./archives";
import type {
  AttributeDefinition,
  EmployeeVersion,
  WorkPattern,
  WorkPatternAssignmentRule,
  ShiftVariant,
  WeekProfile,
  WeekConfiguration,
  Closure,
  DutyRequirement,
  TemporalRule,
  Condition,
  WorkforcePreview,
  WeekAssignment,
  Interval,
} from "./evolution-model";
export type Selector = {
  where?: Condition;
  employeeIds?: string[];
  typeIds?: string[];
  groupIds?: string[];
  attributes?: Record<string, string | number | boolean>;
};
export type Scope = {
  weekProfileIds?: string[];
  dayType?: "ANY" | "HOLIDAY" | "NON_HOLIDAY";
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
  fairnessTags?: string[];
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
  dutyRequirements?: DutyRequirement[];
  temporalRules?: TemporalRule[];
  sharedConstraintIds: string[];
  constraintSetIds: string[];
  scope?: Scope;
};
export type Assignment = {
  employeeId: string;
  date: string;
  shiftId: string;
  intervals?: Interval[];
  variantId?: string;
  weekProfileId?: string;
};
export type SpacingRule = {
  id: string;
  label: string;
  selector: Selector;
  shiftIds: string[];
  fairnessTags?: string[];
  scope: Scope;
  mode: "HARD" | "SOFT";
  unit: "CALENDAR" | "NORMAL_WORK_DAYS";
  minimumGap: number;
  normalShiftIds: string[];
  penalty: "CLOSE_PAIRS" | "GAP_DEFICIT";
  priority: number;
};
export type Scenario = {
  dutyBindingMode?: "ACTIVE_SCOPE" | "GLOBAL";
  spacingRules?: SpacingRule[];
  format: "rostercore.scenario";
  schemaVersion: 1 | 2 | 3 | 4;
  attributeDefinitions?: AttributeDefinition[];
  workPatterns?: WorkPattern[];
  workPatternAssignmentRules?: WorkPatternAssignmentRule[];
  weekProfiles?: WeekProfile[];
  weekConfiguration?: WeekConfiguration;
  dutyRequirements?: DutyRequirement[];
  temporalRules?: TemporalRule[];
  archiveState?: { publishedIds: string[]; completedIds: string[] };
  proposal?: { supersedesId: string; from: string };
  replanning?: {
    from: string;
    baseline: Assignment[];
    stabilityPriority: "BEFORE_FAIRNESS" | "AFTER_FAIRNESS";
  };
  id: string;
  label: string;
  revision: number;
  employeeTypes: { id: string; label: string }[];
  employees: {
    id: string;
    label: string;
    typeId: string;
    attributes: Record<string, string | number | boolean | null>;
    employment?: { validFrom: string; validTo?: string };
    versions?: EmployeeVersion[];
    workPatternId?: string;
  }[];
  groups: { id: string; label: string; selector: Selector; scope?: Scope }[];
  shifts: {
    id: string;
    label: string;
    kind: "WORKING" | "OFF";
    intervals: Interval[];
    variants?: ShiftVariant[];
    fairnessTags?: string[];
  }[];
  calendar: {
    start: string;
    end: string;
    timezone: string;
    excludedDates: string[];
    excludedRanges: { start: string; end: string }[];
    excludedIsoWeeks: string[];
    holidays?: {
      country: "IT";
      catalogueVersion: "IT-2001-2026.1";
      localDates: { date: string; label: string; holiday: boolean }[];
    };
    closures?: Closure[];
  };
  availability: {
    id: string;
    selector: Selector;
    scope: Scope;
    state: "ABSENT";
  }[];
  allowedShifts: {
    allowRequiredRest?: boolean;
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
  diagnostics: {
    code: string;
    path: string;
    message: string;
    severity?: "ERROR" | "WARNING" | "INFORMATION";
    objectIds?: string[];
    suggestion?: string;
    section?: string;
  }[];
  archives?: ScheduleArchive[];
  archive?: ScheduleArchive;
  document?: unknown;
  csv?: string;
  restoredSchedule?: {
    scenario: Scenario;
    result: Result;
    archiveId: string;
    scenarioEncoding?: string;
  };
  workload?: {
    ruleId: string;
    employeeId: string;
    mode: string;
    unit: string;
    totalBurden: number;
    byShift: Record<string, number>;
    knownPriorBurden: number;
    minimumCalendarGap: number | null;
    minimumNormalWorkGap: number | null;
    consecutivePairs: number;
    closePairs: number;
    penalty: number;
  }[];
  quality?: {
    fallback: {
      status: string;
      totalSubstitutions: number;
      stages: {
        policyId: string;
        metric: string;
        priority: number;
        minimumLevel: number;
        incumbent: number;
        lowerBound: number;
        provedMinimum: boolean;
      }[];
    };
    substitutions: {
      date: string;
      requirementId: string;
      employeeId: string;
      level: number;
      minimumProved: boolean;
      reasonCode: string;
    }[];
    audit?: unknown[];
  };
  workforce?: WorkforcePreview;
  weekAssignments?: WeekAssignment[];
  calendarDays?: {
    date: string;
    profileId: string;
    holidays: { id: string; label: string; source?: string }[];
    excluded?: boolean;
  }[];
  coverage?: {
    requirementId: string;
    label: string;
    date: string;
    people: {
      employeeId: string;
      date: string;
      shiftId: string;
      level: number;
      substitution: boolean;
    }[];
  }[];
  changes?: {
    employeeId: string;
    date: string;
    beforeShiftId: string | null;
    afterShiftId: string | null;
    beforeIntervals?: import("./evolution-model").Interval[];
    afterIntervals?: import("./evolution-model").Interval[];
  }[];
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
export const id = (prefix = "item") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
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

export function planningSignature(s: Scenario, result?: Result) {
  const copy = structuredClone(s);
  for (const key of [
    "revision",
    "schemaVersion",
    "archiveState",
    "proposal",
    "appliedChangeSets",
  ] as const)
    delete (copy as unknown as Record<string, unknown>)[key];
  const own = new Map(
    result?.assignments?.map((a) => [a.employeeId + ":" + a.date, a]),
  );
  copy.publishedAssignments = copy.publishedAssignments.filter((a) => {
    const planned = own.get(a.employeeId + ":" + a.date);
    return (
      !planned ||
      planned.shiftId !== a.shiftId ||
      (!!a.intervals &&
        JSON.stringify(a.intervals) !== JSON.stringify(planned.intervals))
    );
  });
  for (const key of [
    "attributeDefinitions",
    "workPatterns",
    "workPatternAssignmentRules",
    "weekProfiles",
    "dutyRequirements",
    "temporalRules",
    "spacingRules",
  ] as const)
    if (!(copy as unknown as Record<string, unknown>)[key])
      (copy as unknown as Record<string, unknown>)[key] = [];
  copy.calendar.closures ??= [];
  // Native responses sort object keys; a serialization-order change is not a planning change.
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, stable(item)]),
          )
        : value;
  return JSON.stringify(stable(copy));
}
