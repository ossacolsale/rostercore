import type { ScheduleArchive } from "./archives";
import {
  defaultPresentation,
  defaultViewOptions,
  pdfDayCategories,
  type Presentation,
  type ViewOptions,
} from "./calendar-export-model";
export const printProfileKey = "rostercore.print-profiles.v1";
export type PrintProfile = {
  id: string;
  name: string;
  scenarioLabel: string;
  options: ViewOptions;
  presentation: Presentation;
};
export function readPrintProfiles(
  storage: Pick<Storage, "getItem">,
): PrintProfile[] {
  const value = storage.getItem(printProfileKey);
  if (!value) return [];
  let data;
  try {data=JSON.parse(value);}catch{throw new Error('Saved print profiles could not be read. Existing data has been preserved.');}
  if (
    data.version !== 1 ||
    !Array.isArray(data.profiles) ||
    data.profiles.some(
      (p: PrintProfile) =>
        !p ||
        typeof p.id !== "string" ||
        typeof p.name !== "string" ||
        !p.options ||
        !p.presentation,
    ) ||
    new Set(data.profiles.map((p: PrintProfile) => p.id)).size !==
      data.profiles.length
  )
    throw new Error(
      "Saved print profiles could not be read. Existing data has been preserved.",
    );
  return data.profiles;
}
export function savePrintProfile(
  profiles: PrintProfile[],
  name: string,
  archive: ScheduleArchive,
  options: ViewOptions,
  presentation: Presentation,
  id?: string,
): { profiles: PrintProfile[]; profile: PrintProfile } {
  name = name.trim();
  if (!name || name.length > 120)
    throw new Error("Enter a print profile name of 1 to 120 characters.");
  if (
    profiles.some(
      (p) =>
        p.id !== id && p.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    throw new Error(
      "A print profile with this name already exists. Choose another name or update the selected profile.",
    );
  const profile: PrintProfile = {
    id: id ?? crypto.randomUUID(),
    name,
    scenarioLabel: archive.scenario.label,
    options: structuredClone({ ...options, includeAbsenceReasons: false }),
    presentation: structuredClone(presentation),
  };
  return {
    profile,
    profiles: id
      ? profiles.map((p) => (p.id === id ? profile : p))
      : [...profiles, profile],
  };
}
export function applyPrintProfile(
  profile: PrintProfile,
  archive: ScheduleArchive,
  current: ViewOptions,
  language: Presentation["language"],
) {
  const defaults = defaultViewOptions(archive),
    saved = profile.options;
  const options: ViewOptions = {
    ...defaults,
    ...saved,
    employeeSelection: {
      ...defaults.employeeSelection,
      ...saved.employeeSelection,
    },
    shiftSelection: { ...defaults.shiftSelection, ...saved.shiftSelection },
    includeAbsenceReasons: false,
  };
  const keep = (ids: string[] | undefined, items: { id: string }[]) =>
    Array.isArray(ids)
      ? ids.filter((id) => items.some((item) => item.id === id))
      : [];
  options.employeeSelection.employeeIds = keep(
    options.employeeSelection.employeeIds,
    archive.scenario.employees,
  );
  options.employeeSelection.typeIds = keep(
    options.employeeSelection.typeIds,
    archive.scenario.employeeTypes,
  );
  options.employeeSelection.groupIds = keep(
    options.employeeSelection.groupIds,
    archive.scenario.groups,
  );
  options.shiftSelection.shiftIds = keep(
    options.shiftSelection.shiftIds,
    archive.scenario.shifts,
  );
  options.shiftSelection.normalShiftIds = keep(
    options.shiftSelection.normalShiftIds,
    archive.scenario.shifts.filter((s) => s.kind === "WORKING"),
  );
  if (!options.shiftSelection.normalShiftIds.length)
    options.shiftSelection.hideNormal = false;
  const start =
      saved.start > archive.period.start ? saved.start : archive.period.start,
    end = saved.end < archive.period.end ? saved.end : archive.period.end;
  Object.assign(
    options,
    start <= end ? { start, end } : { start: current.start, end: current.end },
  );
  const presentation = {
    ...defaultPresentation(),
    ...profile.presentation,
    language,
    excludedDayCategories: (
      profile.presentation.excludedDayCategories ?? []
    ).filter((category) => Object.hasOwn(pdfDayCategories, category)),
  };
  return { options, presentation };
}
