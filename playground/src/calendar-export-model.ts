import type { Scenario } from "./model";
import type { ScheduleArchive } from "./archives";
import type { Interval } from "./evolution-model";
import type { Translate } from "./i18n";
export type ViewOptions = {
  start: string;
  end: string;
  employeeSelection: {
    all: boolean;
    employeeIds: string[];
    typeIds: string[];
    groupIds: string[];
  };
  shiftSelection: {
    mode: "ALL" | "WORKING" | "SPECIAL" | "MANUAL";
    shiftIds: string[];
    normalShiftIds: string[];
    hideNormal: boolean;
  };
  showAbsences: boolean;
  showRest: boolean;
  showClosuresAndHolidays: boolean;
  includeAbsenceReasons: boolean;
};
export type CalendarCell = {
  employeeId: string;
  date: string;
  state: string;
  shiftId?: string;
  shiftLabel?: string;
  absenceReasons?: string[];
  uid: string;
  lifecycle: "DRAFT" | "PUBLISHED" | "COMPLETED" | "SUPERSEDED";
  intervals: (Interval & {
    uid: string;
    startUtcMinute?: number;
    endUtcMinute?: number;
    timeError?: { code: string; message: string };
  })[];
};
export type CalendarView = {
  format: "rostercore.calendar-view";
  schemaVersion: 1;
  authoritative: false;
  scenarioLabel: string;
  period: { start: string; end: string };
  sourcePeriod: { start: string; end: string };
  timezone: string;
  state: string;
  scenarioRevision: number;
  revision: number;
  createdAt: string;
  lastModified: string;
  searchStatus: string;
  preferencesUnproved: boolean;
  completedThrough?: string;
  publishedAt?: string;
  futurePublished: boolean;
  employees: { id: string; label: string }[];
  days: {
    date: string;
    profileId: string;
    profileLabel: string;
    holidays: { id: string; label: string }[];
    hasWorkingAssignments?: boolean;
    noWorkCategories?: PdfDayCategory[];
  }[];
  cells: CalendarCell[];
  totalEmployees: number;
  options: ViewOptions;
};
export const pdfDayCategories = {
  HOLIDAY: "Holidays without work",
  CLOSURE: "Business closures without work",
  REST: "Rest days, including weekly rest",
  EXCLUDED: "Excluded dates and weeks",
  UNCALCULATED: "Uncalculated or unplanned dates and weeks",
  ABSENCE: "Days when everyone is absent or otherwise unavailable",
  INACTIVE: "Days with no active employees",
  OTHER: "Other days with no work",
} as const;
export type PdfDayCategory = keyof typeof pdfDayCategories;
export function calendarPrintView(
  view: CalendarView,
  options: Pick<Presentation, "excludedDayCategories">,
): CalendarView {
  const excluded = new Set(options.excludedDayCategories ?? []);
  const days = view.days.filter(
    (day) =>
      day.hasWorkingAssignments !== false ||
      !day.noWorkCategories?.some((category) => excluded.has(category)),
  );
  if (days.length === view.days.length) return view;
  const dates = new Set(days.map((day) => day.date));
  return {
    ...view,
    days,
    cells: view.cells.filter((cell) => dates.has(cell.date)),
  };
}
export type Presentation = {
  excludedDayCategories?: PdfDayCategory[];
  language: "en" | "it";
  mode: "COMPACT" | "COMPLETE";
  layout: "WEEK" | "MONTH" | "PERSON";
  paper: "A4" | "A3";
  orientation: "AUTO" | "PORTRAIT" | "LANDSCAPE";
  business: string;
  title: string;
  notes: string;
  showPublishedDate: boolean;
  showRevision: boolean;
  icsMode: "COLLECTIVE" | "INDIVIDUAL";
  includeTimesInDescription: boolean;
};
export const stateKeys: Record<string, string> = {
  REST: "Rest",
  ABSENT: "Unavailable",
  CLOSED: "Business closed",
  INACTIVE: "Not active",
  EXCLUDED: "Excluded from planning",
  UNPLANNED: "Not planned",
  FILTERED_SHIFT: "Work hidden by filter",
  FILTERED_REST: "Rest hidden by filter",
  FILTERED_ABSENCE: "Unavailability hidden by filter",
  FILTERED_CLOSED: "Closure hidden by filter",
  FILTERED_PERSON: "Outside selected role or group",
};
export const stateSymbols: Record<string, string> = {
  REST: "R",
  ABSENT: "A",
  CLOSED: "C",
  INACTIVE: "I",
  EXCLUDED: "X",
  UNPLANNED: "?",
  FILTERED_SHIFT: ".",
  FILTERED_REST: "r-",
  FILTERED_ABSENCE: "a-",
  FILTERED_CLOSED: "c-",
  FILTERED_PERSON: "p-",
};
export function normalShiftIds(s: Scenario) {
  const duties = [
    ...(s.dutyRequirements ?? []),
    ...s.policies
      .filter((p) => p.active && !p.draft)
      .flatMap((p) => p.dutyRequirements ?? []),
  ]
    .filter((d) => d.mode === "RESPONSIBILITY")
    .flatMap((d) => d.shiftIds);
  return s.shifts
    .filter(
      (sh) =>
        sh.kind === "WORKING" &&
        !sh.fairnessTags?.length &&
        !duties.includes(sh.id),
    )
    .map((sh) => sh.id);
}
export function defaultViewOptions(a: ScheduleArchive): ViewOptions {
  return {
    start: a.period.start,
    end: a.period.end,
    employeeSelection: {
      all: true,
      employeeIds: [],
      typeIds: [],
      groupIds: [],
    },
    shiftSelection: {
      mode: "ALL",
      shiftIds: [],
      normalShiftIds: normalShiftIds(a.scenario),
      hideNormal: false,
    },
    showAbsences: true,
    showRest: true,
    showClosuresAndHolidays: true,
    includeAbsenceReasons: false,
  };
}
export function defaultPresentation(): Presentation {
  return {
    excludedDayCategories: [],
    language: "en",
    mode: "COMPACT",
    layout: "WEEK",
    paper: "A4",
    orientation: "AUTO",
    business: "",
    title: "",
    notes: "",
    showPublishedDate: false,
    showRevision: false,
    icsMode: "COLLECTIVE",
    includeTimesInDescription: true,
  };
}
export function cellText(c: CalendarCell, t: Translate, complete = false) {
  if (c.state !== "WORKING")
    return (
      t(stateKeys[c.state] ?? "Not planned") +
      (c.absenceReasons?.length ? " - " + c.absenceReasons.join(", ") : "")
    );
  return (
    (c.shiftLabel ?? "") +
    (complete
      ? "\n" +
        c.intervals
          .map(
            (i) =>
              `${i.start}-${i.end}${i.endDayOffset ? " " + t("(+1 day)") : ""}`,
          )
          .join("\n")
      : "")
  );
}
export function archiveStatus(
  a: Pick<CalendarView, "state" | "completedThrough" | "futurePublished">,
  t: Translate,
) {
  if (a.state === "COMPLETED")
    return (
      t("Work confirmed through {date}", { date: a.completedThrough ?? "" }) +
      "; " +
      t(a.futurePublished ? "Future dates published" : "Future dates are draft")
    );
  return t(
    a.state === "PUBLISHED"
      ? "Published calendar"
      : a.state === "SUPERSEDED"
        ? "Superseded calendar"
        : "Draft calendar",
  );
}
export function filename(s: string) {
  return (
    Array.from(
      s
        .normalize("NFKC")
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
        .replace(/\.+/g, " ")
        .trim()
        .replace(/\s+/g, "-"),
    )
      .slice(0, 80)
      .join("") || "calendar"
  );
}
export function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function presetOptions(
  name: string,
  a: ScheduleArchive,
  current: ViewOptions,
): ViewOptions {
  const o = structuredClone(current);
  o.includeAbsenceReasons = false;
  if (name === "FULL") return defaultViewOptions(a);
  if (name === "CLOSINGS") {
    const tags = a.scenario.shifts.flatMap((sh) => sh.fairnessTags ?? []);
    const tag = tags[0];
    o.shiftSelection.mode = "MANUAL";
    o.shiftSelection.shiftIds = tag
      ? a.scenario.shifts
          .filter((sh) => sh.fairnessTags?.includes(tag))
          .map((sh) => sh.id)
      : a.scenario.shifts
          .filter(
            (sh) =>
              sh.kind === "WORKING" &&
              !o.shiftSelection.normalShiftIds.includes(sh.id),
          )
          .map((sh) => sh.id);
    o.shiftSelection.hideNormal = false;
    o.showAbsences = false;
    o.showRest = false;
  } else if (name === "PERSONAL") {
    o.employeeSelection = {
      all: false,
      employeeIds: [
        o.employeeSelection.employeeIds[0] ?? a.scenario.employees[0]?.id,
      ].filter(Boolean),
      typeIds: [],
      groupIds: [],
    };
  } else if (name === "DEPARTMENT") {
    o.employeeSelection = {
      all: false,
      employeeIds: [],
      typeIds: a.scenario.employeeTypes.slice(0, 1).map((x) => x.id),
      groupIds: [],
    };
  } else if (name === "ABSENCE_REST") {
    o.shiftSelection.mode = "MANUAL";
    o.shiftSelection.shiftIds = [];
    o.showAbsences = true;
    o.showRest = true;
  }
  return o;
}
export function shortcutPeriod(
  kind: "ALL" | "WEEK" | "MONTH",
  focus: string,
  a: ScheduleArchive,
) {
  let start = a.period.start,
    end = a.period.end;
  const d = new Date(focus + "T12:00:00Z");
  if (kind === "WEEK") {
    const weekday = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 1 - weekday);
    start = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    end = d.toISOString().slice(0, 10);
  } else if (kind === "MONTH") {
    start = focus.slice(0, 7) + "-01";
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    end = d.toISOString().slice(0, 10);
  }
  return {
    start: start < a.period.start ? a.period.start : start,
    end: end > a.period.end ? a.period.end : end,
  };
}
