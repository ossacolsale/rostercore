import type { Scenario } from "./model";
import type { Translate } from "./i18n";
export function summarizeChanges(
  document: Record<string, unknown>,
  s: Scenario,
  t: Translate,
) {
  const ops = (document.operations ?? []) as Record<string, unknown>[];
  const labels = (ids: unknown, items: { id: string; label?: string }[]) =>
    Array.isArray(ids)
      ? ids
          .map((id) => items.find((x) => x.id === id)?.label ?? String(id))
          .join(", ")
      : "";
  return ops.map((op) => {
    const kind = String(op.op),
      v = (op.value ?? {}) as Record<string, unknown>,
      patch = (op.patch ?? {}) as Record<string, unknown>;
    const who =
      s.employees.find((e) => e.id === op.employeeId)?.label ??
      t("Selected person");
    if (kind === "CREATE_AVAILABILITY" || kind === "REPLACE_AVAILABILITY") {
      const scope = (v.scope ?? {}) as { start?: string; end?: string };
      const sel = (v.selector ?? {}) as {
        employeeIds?: string[];
        typeIds?: string[];
        groupIds?: string[];
      };
      const person =
        labels(sel.employeeIds, s.employees) ||
        labels(sel.typeIds, s.employeeTypes) ||
        labels(sel.groupIds, s.groups) ||
        t("Selected people");
      return t("Unavailability for {person}: {start} to {end}.", {
        person,
        start: scope.start ?? t("the planning start"),
        end: scope.end ?? t("the planning end"),
      });
    }
    if (kind === "DELETE_AVAILABILITY")
      return t("Remove the selected unavailability.");
    if (kind === "UPDATE_EMPLOYEE") {
      const parts: string[] = [];
      if (patch.attributes)
        for (const [id, value] of Object.entries(
          patch.attributes as Record<string, unknown>,
        ))
          parts.push(
            (s.attributeDefinitions?.find((a) => a.id === id)?.label ?? id) +
              ": " +
              String(value),
          );
      if ("workPatternId" in patch)
        parts.push(
          patch.workPatternId === null
            ? t("Automatic work pattern")
            : (s.workPatterns?.find((p) => p.id === patch.workPatternId)
                ?.label ?? String(patch.workPatternId)),
        );
      return t("Change {person} from {date}: {changes}.", {
        person: who,
        date: String(op.effectiveFrom),
        changes: parts.join("; "),
      });
    }
    if (kind === "REPLACE_SHIFT" || kind === "CREATE_SHIFT") {
      const shift = v as unknown as Scenario["shifts"][number],
        old = s.shifts.find((sh) => sh.id === shift.id);
      const changed = (shift.variants ?? []).filter(
        (v) =>
          JSON.stringify(v) !==
          JSON.stringify(old?.variants?.find((o) => o.id === v.id)),
      );
      const hours = (items: typeof shift.intervals) =>
        items
          .map(
            (i) =>
              i.start +
              "-" +
              i.end +
              (i.endDayOffset ? " " + t("(+1 day)") : ""),
          )
          .join(" / ");
      return t("Working hours for {shift}: {hours}", {
        shift: shift.label,
        hours: changed.length
          ? changed
              .map(
                (v) =>
                  (v.scope.start ?? t("the planning start")) +
                  " - " +
                  (v.scope.end ?? t("the planning end")) +
                  ": " +
                  hours(v.intervals),
              )
              .join("; ")
          : hours(shift.intervals),
      });
    }
    if (kind === "CREATE_EMPLOYEE")
      return t("Add {person} to the team.", {
        person: String(v.label ?? t("New colleague")),
      });
    if (kind === "END_EMPLOYMENT")
      return t("End employment for {person} from {date}.", {
        person: who,
        date: String(op.effectiveFrom),
      });
    if (kind === "SET_CLOSURES") {
      const closures = (op.value ?? []) as {
        id: string;
        label: string;
        validFrom: string;
        validTo: string;
      }[];
      return (
        closures
          .filter(
            (c) =>
              !s.calendar.closures?.some(
                (old) => JSON.stringify(old) === JSON.stringify(c),
              ),
          )
          .map((c) =>
            t("Business closure: {start}; reopens {end}.", {
              start: c.validFrom,
              end: c.validTo,
            }),
          )
          .join(" ") || t("Update business closures.")
      );
    }
    if (kind === "CREATE_SPACING_RULE" || kind === "REPLACE_SPACING_RULE")
      return t("Change spacing for {rule}: at least {gap} {unit}.", {
        rule: String(v.label ?? t("Selected duties")),
        gap: Number(v.minimumGap),
        unit: t(
          v.unit === "NORMAL_WORK_DAYS"
            ? "actual normal work assignments"
            : "calendar days",
        ),
      });
    if (kind === "SET_CALENDAR")
      return t(
        "Change the planning period to {start} - {end} and review opening-day settings.",
        { start: String(v.start), end: String(v.end) },
      );
    const nouns: Record<string, string> = {
      EMPLOYEE_TYPE: "professional role",
      ATTRIBUTE: "qualification or contract attribute",
      GROUP: "staff group",
      SHIFT: "working hours",
      WORK_PATTERN: "work pattern",
      PATTERN_RULE: "automatic work-pattern rule",
      WEEK_PROFILE: "week type",
      ALLOWED_SHIFTS: "permitted working shifts",
      CONSTRAINT: "staffing rule",
      CONSTRAINT_SET: "staffing rules",
      POLICY: "duty distribution",
      COVERAGE: "required coverage",
      TEMPORAL_RULE: "rest or next-day rule",
    };
    const cut = kind.indexOf("_"),
      verb = kind.slice(0, cut),
      entity = kind.slice(cut + 1);
    if (nouns[entity])
      return t(
        verb === "DELETE"
          ? "Remove {item}: {label}."
          : verb === "CREATE"
            ? "Add {item}: {label}."
            : "Update {item}: {label}.",
        {
          item: t(nouns[entity]),
          label: String(v.label ?? op.id ?? t("Selected item")),
        },
      );
    if (kind === "SET_WEEK_CONFIGURATION")
      return t("Change recurring weeks and week exceptions.");
    if (kind === "SET_SEARCH")
      return t("Change the time available to generate the calendar.");
    if (kind === "SET_BASE_CONSTRAINTS")
      return t("Change which existing staffing rules apply.");
    if (kind === "SYNC_HR")
      return t("Apply the selected HR availability updates.");
    return t("Apply the described configuration change.");
  });
}
