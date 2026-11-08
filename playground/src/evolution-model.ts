import type { Assignment, Scenario, Scope, Selector } from "./model";
export type Scalar = string | number | boolean;
export type Effective = { validFrom: string; validTo?: string };
export type Interval = {
  start: string;
  end: string;
  endDayOffset: number;
  startFold?: 0 | 1;
  endFold?: 0 | 1;
};
export type Condition =
  | { op: "AND"; children: Condition[] }
  | { op: "OR"; children: Condition[] }
  | { op: "NOT"; child: Condition }
  | {
      op: "EQ" | "NE" | "LT" | "LE" | "GT" | "GE";
      attributeId: string;
      value: Scalar;
    }
  | { op: "IN" | "NOT_IN"; attributeId: string; values: Scalar[] }
  | { op: "EXISTS" | "NOT_EXISTS"; attributeId: string };
export type AttributeDefinition = {
  id: string;
  label: string;
  type: "STRING" | "BOOLEAN" | "NUMBER" | "INTEGER" | "ENUM";
  description?: string;
  values?: Scalar[];
  default?: Scalar;
  unit?: string;
  visible?: boolean;
  validFrom?: string;
  validTo?: string;
};
export type EmployeeVersion = Effective & {
  typeId?: string;
  workPatternId?: string;
  attributes?: Record<string, Scalar | null>;
};
export type WorkPattern = {
  id: string;
  label: string;
  versions: (Effective & {
    weekdays: number[];
    shiftIds: string[];
    exceptions?: { date: string; shiftIds: string[] }[];
  })[];
};
export type ShiftVariant = {
  id: string;
  label: string;
  priority: number;
  selector: Selector;
  scope: Scope;
  workPatternIds?: string[];
  intervals: Interval[];
};
export type WeekProfile = {
  id: string;
  label: string;
  shiftIds?: string[];
  offWeekdays: number[];
  holidayMode: "NORMAL" | "OFF";
  constraintIds: string[];
  policyIds: string[];
};
export type ManualWeek = {
  week: string;
  profileId: string;
  overrideRecurrence: boolean;
  waiveFrequencyIds: string[];
  reason: string;
};
export type Recurrence = Effective & {
  id: string;
  label: string;
  anchor: string;
  sequence: string[];
};
export type Frequency = {
  id: string;
  profileId: string;
  minGapWeeks?: number;
  maxGapWeeks?: number;
  windowWeeks?: number;
  minCount?: number;
  maxCount?: number;
  desiredCount?: number;
  desiredGapWeeks?: number;
};
export type WeekConfiguration = {
  defaultProfileId?: string;
  manual: ManualWeek[];
  recurrences: Recurrence[];
  automatic?: Effective & { profileIds: string[] };
  frequencies: Frequency[];
  history: { week: string; profileId: string }[];
};
export type Closure = Effective & {
  id: string;
  label: string;
  selector: Selector;
  reason: string;
  administrativeType?: string;
  exceptions: {
    date: string;
    selector: Selector;
    authorized: true;
    reason: string;
  }[];
};
export type DutyRequirement = {
  id: string;
  label: string;
  mode: "RESPONSIBILITY" | "PRESENCE";
  shiftIds: string[];
  levels: { selector: Selector; level: number }[];
  comparison: "EQ" | "GE" | "LE";
  count: number;
  intervals: Interval[];
  scope: Scope;
  preferencePriority: number;
  exclusiveGroup?: string;
  bindAssignments?: boolean;
};
export type TemporalRule = {
  id: string;
  label: string;
  type: "SUCCESSION" | "FORBIDDEN_PAIR" | "MIN_REST";
  selector: Selector;
  fromShiftIds: string[];
  toShiftIds: string[];
  offsetDays: number;
  minimumMinutes?: number;
  scope: Scope;
};
export type WorkforcePreview = {
  date: string;
  employees: {
    employeeId: string;
    label: string;
    active: boolean;
    state: { typeId: string; workPatternId?: string };
    attributes: Record<
      string,
      { origin: "EXPLICIT" | "DEFAULT" | "MISSING"; value?: Scalar }
    >;
    groups: string[];
    shifts: {
      shiftId: string;
      variantId: string;
      profileId: string;
      intervals: Interval[];
      admissible: boolean;
    }[];
  }[];
  selectedEmployeeIds?: string[];
};
export type WeekAssignment = {
  week: string;
  isoWeek: string;
  profileId?: string;
  profileIds?: string[];
  origin: string;
};
export function initializeEvolution(s: Scenario) {
  s.schemaVersion = 2;
  s.attributeDefinitions ??= [];
  s.workPatterns ??= [];
  s.weekProfiles ??= [];
  s.weekConfiguration ??= {
    manual: [],
    recurrences: [],
    frequencies: [],
    history: [],
  };
  s.dutyRequirements ??= [];
  s.temporalRules ??= [];
  s.calendar.closures ??= [];
}
export function isoMonday(value: string) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const workingDays = [1, 2, 3, 4, 5];
