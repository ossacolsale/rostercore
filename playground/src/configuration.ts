import type { Scenario } from "./model";
export const configurationSteps = [
  ["overview", "Overview"],
  ["people", "People & groups"],
  ["shifts", "Shift types"],
  ["contracts", "Contracts & work patterns"],
  ["variants", "Shift time variants"],
  ["weeks", "Week profiles & recurrence"],
  ["calendar", "Calendar & availability"],
  ["coverage", "Coverage & temporal rules"],
  ["policies", "Planning policies"],
  ["imports", "AI & HR imports"],
  ["results", "Schedule & fairness"],
] as const;
export type Catalogue =
  | "employeeTypes"
  | "employees"
  | "attributeDefinitions"
  | "groups"
  | "workPatterns"
  | "shifts"
  | "weekProfiles"
  | "constraints"
  | "policies";
const references: Record<string, Catalogue> = {
  employeeId: "employees",
  employeeIds: "employees",
  typeId: "employeeTypes",
  typeIds: "employeeTypes",
  attributeId: "attributeDefinitions",
  groupIds: "groups",
  workPatternId: "workPatterns",
  workPatternIds: "workPatterns",
  shiftId: "shifts",
  shiftIds: "shifts",
  fromShiftIds: "shifts",
  toShiftIds: "shifts",
  profileId: "weekProfiles",
  profileIds: "weekProfiles",
  weekProfileId: "weekProfiles",
  weekProfileIds: "weekProfiles",
  defaultProfileId: "weekProfiles",
  constraintIds: "constraints",
  baseConstraintIds: "constraints",
  sharedConstraintIds: "constraints",
  policyIds: "policies",
};
export function catalogueReferences(s: Scenario) {
  const found: { catalogue: Catalogue; id: string; path: string }[] = [];
  function walk(value: unknown, path: string) {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}/${i}`));
    else if (value && typeof value === "object")
      for (const [key, v] of Object.entries(value)) {
        const at = `${path}/${key}`,
          catalogue = references[key];
        if (catalogue) {
          for (const id of Array.isArray(v) ? v : [v])
            if (typeof id === "string") found.push({ catalogue, id, path: at });
        } else if (
          key === "sequence" &&
          path.startsWith("/weekConfiguration/recurrences")
        ) {
          for (const id of v as string[])
            found.push({ catalogue: "weekProfiles", id, path: at });
        } else if (key === "attributes" && v && typeof v === "object") {
          if (path.includes("/selector"))
            for (const id of Object.keys(v as object).filter((id) =>
              (s.attributeDefinitions ?? []).some((a) => a.id === id),
            ))
              found.push({ catalogue: "attributeDefinitions", id, path: at });
        } else walk(v, at);
      }
  }
  walk(s, "");
  return found;
}
export function dependentReferences(
  s: Scenario,
  catalogue: Catalogue,
  id: string,
) {
  const refs = catalogueReferences(s).filter(
    (r) => r.catalogue === catalogue && r.id === id,
  );
  if (catalogue === "attributeDefinitions") {
    function walk(value: unknown, path: string) {
      if (Array.isArray(value))
        value.forEach((v, i) => walk(v, `${path}/${i}`));
      else if (value && typeof value === "object")
        for (const [key, v] of Object.entries(value)) {
          if (
            key === "attributes" &&
            v &&
            typeof v === "object" &&
            Object.hasOwn(v, id)
          )
            refs.push({ catalogue, id, path: `${path}/attributes/${id}` });
          else walk(v, `${path}/${key}`);
        }
    }
    walk(s, "");
  }
  return refs;
}
export function editorForPath(path: string) {
  return path === "/"
    ? "overview"
    : path.includes("/variants")
      ? "variants"
      : path.startsWith("/workPattern")
        ? "contracts"
        : path.startsWith("/week")
          ? "weeks"
          : path.startsWith("/calendar") ||
              path.startsWith("/availability") ||
              path.startsWith("/allowedShifts")
            ? "calendar"
            : path.startsWith("/shifts")
              ? "shifts"
              : path.startsWith("/policies") ||
                  path.startsWith("/constraints") ||
                  path.startsWith("/constraintSets")
                ? "policies"
                : path.startsWith("/duty") || path.startsWith("/temporal")
                  ? "coverage"
                  : "people";
}
export type StageState =
  | "NOT_STARTED"
  | "INCOMPLETE"
  | "LOCALLY_COHERENT"
  | "DETECTED_ERROR";
export function referenceLabel(s: Scenario, path: string) {
  let value: unknown = s;
  let label = "";
  for (const key of path.split("/").slice(1)) {
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (typeof object.label === "string") label = object.label;
      value = object[key];
    }
  }
  return label || path;
}
export function stageReport(
  s: Scenario,
  key: string,
  errors: string[] = [],
): { state: StageState; count: number; issues: string[] } {
  const sources: Record<string, unknown[]> = {
    overview: [s.calendar],
    people: [
      ...s.employeeTypes,
      ...s.employees,
      ...(s.attributeDefinitions ?? []),
    ],
    shifts: s.shifts,
    contracts: [
      ...(s.workPatterns ?? []),
      ...(s.workPatternAssignmentRules ?? []),
    ],
    variants: s.shifts.flatMap((x) => x.variants ?? []),
    weeks: s.weekProfiles ?? [],
    calendar: [s.calendar, ...s.availability],
    coverage: [...(s.dutyRequirements ?? []), ...(s.temporalRules ?? [])],
    policies: s.policies,
    imports: [],
    results: [],
  };
  const items = sources[key] ?? [],
    issues: string[] = [];
  const sectionRefs = catalogueReferences(s).filter(
    (r) => editorForPath(r.path) === key,
  );
  const emptyReferences = sectionRefs.filter((r) => !r.id.trim());
  const invalid = sectionRefs.filter(
    (r) => r.id.trim() && !(s[r.catalogue] ?? []).some((x) => x.id === r.id),
  );
  if (invalid.length)
    issues.push("Some references point to missing catalogue items.");
  if (errors.some((path) => editorForPath(path) === key))
    issues.push("Core validation detected an error in this section.");
  let incomplete =
    emptyReferences.length > 0 ||
    items.some((x) => {
      const item = x as { label?: string; id?: string };
      return (
        (item.id !== undefined && !item.id) ||
        (item.label !== undefined && !item.label.trim())
      );
    });
  if (
    key === "overview" &&
    (!s.calendar.start ||
      !s.calendar.end ||
      !s.calendar.timezone ||
      !s.label.trim())
  )
    incomplete = true;
  if (
    key === "people" &&
    (!s.employees.length ||
      !s.employeeTypes.length ||
      s.employees.some((e) => !e.typeId))
  )
    incomplete = true;
  if (key === "contracts") {
    if (!s.shifts.length)
      issues.push("Create logical shifts before defining work patterns.");
    incomplete ||= (s.workPatterns ?? []).some(
      (p) =>
        !p.versions.length ||
        p.versions.some((v) => !v.validFrom || !v.shiftIds.length),
    );
    incomplete ||= (s.workPatternAssignmentRules ?? []).some(
      (r) => !r.validFrom || !r.workPatternId,
    );
  }
  if (key === "variants") {
    if (!s.shifts.length)
      issues.push("Create logical shifts before defining variants.");
    incomplete ||= s.shifts.some((sh) =>
      (sh.variants ?? []).some(
        (v) => sh.kind === "WORKING" && !v.intervals.length,
      ),
    );
  }
  if (
    key === "weeks" &&
    s.weekProfiles?.length &&
    !s.weekConfiguration?.defaultProfileId &&
    !s.weekConfiguration?.automatic &&
    !s.weekConfiguration?.recurrences.length
  )
    incomplete = true;
  if (key === "shifts" && !s.shifts.length) incomplete = true;
  if (key === "policies")
    incomplete ||= s.policies.some(
      (p) => !p.objective.shiftIds.length && !p.objective.fairnessTags?.length,
    );
  const definite =
    invalid.length > 0 || errors.some((path) => editorForPath(path) === key);
  return {
    state: definite
      ? "DETECTED_ERROR"
      : !items.length
        ? "NOT_STARTED"
        : incomplete || issues.length
          ? "INCOMPLETE"
          : "LOCALLY_COHERENT",
    count: items.length,
    issues,
  };
}
