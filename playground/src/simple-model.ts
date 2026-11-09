import { id, type Scenario, type Policy, type Selector } from "./model";
export const daysOfWeek = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const metrics = [
  "MAX_ABSOLUTE_PREFIX_DEVIATION",
  "SUM_ABSOLUTE_PREFIX_DEVIATIONS",
  "FINAL_ABSOLUTE_DEVIATION",
];
export function simpleScenario(
  start = new Date().toISOString().slice(0, 10),
): Scenario {
  const end = new Date(start + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 13);
  return {
    dutyBindingMode: "GLOBAL",
    format: "rostercore.scenario",
    schemaVersion: 4,
    id: id("scenario"),
    label: "New planning scenario",
    revision: 1,
    employeeTypes: [{ id: "staff", label: "Staff" }],
    employees: [],
    groups: [],
    attributeDefinitions: [
      {
        id: "contract",
        label: "Contract",
        type: "ENUM",
        values: ["FULL_TIME", "PART_TIME"],
        default: "FULL_TIME",
      },
    ],
    shifts: [
      {
        id: "normal",
        label: "Normal work",
        kind: "WORKING",
        intervals: [{ start: "09:00", end: "17:00", endDayOffset: 0 }],
      },
      { id: "off", label: "Rest", kind: "OFF", intervals: [] },
    ],
    workPatterns: [],
    workPatternAssignmentRules: [],
    weekProfiles: [
      {
        id: "ordinary",
        label: "Ordinary week",
        offWeekdays: [6, 7],
        holidayMode: "OFF",
        constraintIds: [],
        policyIds: [],
      },
    ],
    weekConfiguration: {
      defaultProfileId: "ordinary",
      manual: [],
      recurrences: [],
      frequencies: [],
      history: [],
    },
    calendar: {
      start,
      end: end.toISOString().slice(0, 10),
      timezone: "Europe/Rome",
      excludedDates: [],
      excludedRanges: [],
      excludedIsoWeeks: [],
      closures: [],
      holidays: {
        country: "IT",
        catalogueVersion: "IT-2001-2026.1",
        localDates: [],
      },
    },
    availability: [],
    allowedShifts: [],
    constraints: [],
    baseConstraintIds: [],
    constraintSets: [],
    policies: [],
    dutyRequirements: [],
    temporalRules: [],
    spacingRules: [],
    history: { assignments: [], fairnessSnapshots: [] },
    publishedAssignments: [],
    hrState: { events: [], snapshotRevisions: {} },
    search: { maxTimeSeconds: 30, seed: 42, workers: 1, deterministic: true },
  };
}
export function simplePolicy(
  label: string,
  shiftIds: string[],
  selector: Selector = {},
  priority = 0,
): Policy {
  return {
    id: id("fairness"),
    label,
    revision: 1,
    active: true,
    draft: false,
    dependencies: [],
    constraints: [],
    sharedConstraintIds: [],
    constraintSetIds: [],
    objective: {
      id: id("objective"),
      type: "CUMULATIVE_FAIRNESS",
      mode: "CONTINUOUS_BALANCED",
      measure: "COUNT",
      selector,
      shiftIds,
      participation: "AVAILABILITY_WEIGHTED",
      metrics,
      priority,
    },
  };
}
export function operationalScope(s: Scenario, profileId: string) {
  const p = s.weekProfiles?.find((p) => p.id === profileId);
  return {
    weekProfileIds: [profileId],
    weekdays: [1, 2, 3, 4, 5, 6, 7].filter((d) => !p?.offWeekdays.includes(d)),
    dayType:
      p?.holidayMode === "OFF" ? ("NON_HOLIDAY" as const) : ("ANY" as const),
  };
}
export function synchronizeSimpleScopes(
  s: Scenario,
  profileId: string,
  before: Scenario,
) {
  const prior = operationalScope(before, profileId),
    next = operationalScope(s, profileId);
  for (const rule of [...(s.dutyRequirements ?? []), ...s.allowedShifts])
    if (
      rule.id.startsWith("simple:") &&
      rule.scope.weekProfileIds?.length === 1 &&
      rule.scope.weekProfileIds[0] === profileId
    ) {
      // Only automatically derived fields follow opening changes. Preserve edited dates,
      // exclusions and custom weekday/profile restrictions rather than broadening them.
      if (
        JSON.stringify([...(rule.scope.weekdays ?? [])].sort()) ===
        JSON.stringify([...prior.weekdays].sort())
      )
        rule.scope.weekdays = next.weekdays;
      if (rule.scope.dayType === prior.dayType)
        rule.scope.dayType = next.dayType;
    }
}
