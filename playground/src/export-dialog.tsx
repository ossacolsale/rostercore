import { applyPrintProfile } from "./print-profiles";
import { PrintProfileControls } from "./print-profile-controls";
import { useEffect, useRef, useState } from "react";
import { type ScheduleArchive, textDownload } from "./archives";
import {
  pdfDayCategories,
  calendarPrintView,
  type PdfDayCategory,
  type ViewOptions,
  type CalendarView,
  type Presentation,
  defaultViewOptions,
  defaultPresentation,
  presetOptions,
  shortcutPeriod,
  downloadBytes,
  filename,
} from "./calendar-export-model";
import {
  type PdfExport,
  generatePdf,
  generateIcs,
  calendarZip,
} from "./calendar-files";
import { CalendarGrid, PdfPreview } from "./calendar-view";
import { Text, Select, Multi } from "./editors";
import { useI18n } from "./i18n";
import { coreAction } from "./api";
import { notifyError } from "./notifications";
import { download } from "./model";
const preferenceKey = "rostercore.export-preferences.v1";
let fontsPromise:
  | Promise<{ regular: Uint8Array; bold: Uint8Array }>
  | undefined;
export function exportFonts() {
  return (fontsPromise ??= Promise.all(
    ["/fonts/DejaVuSans.ttf", "/fonts/DejaVuSans-Bold.ttf"].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Cannot load the local PDF font");
      return new Uint8Array(await response.arrayBuffer());
    }),
  )
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((e) => {
      fontsPromise = undefined;
      throw e;
    }));
}
export function ExportDialog({
  archive,
  initial,
  onClose,
}: {
  archive: ScheduleArchive;
  initial?: ViewOptions;
  onClose: () => void;
}) {
  const { t, language, localizeError, diagnostic } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [o, setO] = useState<ViewOptions>(() => ({
    ...(initial ?? defaultViewOptions(archive)),
    includeAbsenceReasons: false,
  }));
  const [p, setP] = useState<Presentation>({
    ...defaultPresentation(),
    language,
  });
  const [format, setFormat] = useState("PDF"),
    [preset, setPreset] = useState("CUSTOM"),
    [focus, setFocus] = useState(initial?.start ?? archive.period.start),
    [view, setView] = useState<CalendarView>(),
    [pdf, setPdf] = useState<PdfExport>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [query, setQuery] = useState("");
  const [readyKey, setReadyKey] = useState("");
  const selectionKey = JSON.stringify([o, p, format, language]);
  const update = (fn: (draft: ViewOptions) => void) => {
    setO((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setPreset("CUSTOM");
  };
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPdf(undefined);
    const timer = setTimeout(async () => {
      try {
        if (format === "JSON") {
          if (active) {
            setView(undefined);
            setLoading(false);
          }
          return;
        }
        const result = await coreAction(
          "archives",
          archive.scenario,
          {
            document: {
              operation: "VIEW",
              id: archive.id,
              archives: [archive],
              options: o,
              dryRun: false,
            },
          },
          { silent: true },
        );
        if (result.status !== "EXPORTED")
          throw new Error(
            result.diagnostics.map((d) => diagnostic(d)).join("\n"),
          );
        const current = result.document as CalendarView;
        if (active) setView(current);
        if (format === "PDF" && current.employees.length) {
          const rendered = await generatePdf(
            current,
            { ...p, language },
            t,
            await exportFonts(),
          );
          if (active) setPdf(rendered);
        }
        if (active) {
          setLoading(false);
          setReadyKey(selectionKey);
        }
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [archive, o, p, format, language]);
  const restore = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
      if (saved?.version !== 1) return;
      const loaded = applyPrintProfile(
        {
          id: "legacy",
          name: "",
          scenarioLabel: archive.scenario.label,
          options: { ...saved.options, start: o.start, end: o.end },
          presentation: saved.presentation,
        },
        archive,
        o,
        language,
      );
      setO(loaded.options);
      setP(loaded.presentation);
      setPreset("CUSTOM");
      setPrivacy(false);
    } catch (e) {
      notifyError((e as Error).message);
    }
  };
  const save = async () => {
    try {
      const base =
        filename(archive.scenario.label) + "-" + o.start + "-" + o.end;
      if (format === "JSON") {
        download(filename(archive.scenario.label) + ".schedule.json", archive);
        return;
      }
      if (!view || loading || readyKey !== selectionKey) return;
      if (format === "PDF" && pdf)
        downloadBytes(base + ".pdf", pdf.bytes, "application/pdf");
      else if (format === "CSV") {
        const result = await coreAction(
          "archives",
          archive.scenario,
          {
            document: {
              operation: "CSV",
              id: archive.id,
              archives: [archive],
              options: o,
              dryRun: false,
            },
          },
          { silent: true },
        );
        if (result.csv === undefined)
          throw new Error(
            result.diagnostics.map((d) => diagnostic(d)).join("\n"),
          );
        textDownload(
          base + ".csv",
          "\ufeff" + result.csv,
          "text/csv;charset=utf-8",
        );
      } else if (
        format === "ICS" &&
        p.icsMode === "INDIVIDUAL" &&
        view.employees.length > 1
      )
        downloadBytes(
          base + "-personal.zip",
          calendarZip(view, { ...p, language }, t),
          "application/zip",
        );
      else if (format === "ICS")
        textDownload(
          base + ".ics",
          generateIcs(
            view,
            { ...p, language },
            t,
            p.icsMode === "INDIVIDUAL" ? view.employees[0]?.id : undefined,
          ),
          "text/calendar;charset=utf-8",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const downloadLabel =
    format === "PDF"
      ? t("Download PDF")
      : format === "CSV"
        ? t("Download CSV")
        : format === "JSON"
          ? t("Save complete calendar archive")
          : p.icsMode === "INDIVIDUAL" && (view?.employees.length ?? 0) > 1
            ? t("Download personal calendars ZIP")
            : t("Download iCalendar");
  return (
    <dialog
      ref={ref}
      className="export-dialog"
      aria-label={t("Export calendar")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="export-header">
        <div>
          <h2>{t("Export calendar")}</h2>
          <p>
            {archive.scenario.label} · {archive.period.start} -{" "}
            {archive.period.end}
          </p>
        </div>
        <button onClick={onClose} aria-label={t("Close export")}>
          ×
        </button>
      </header>
      <div className="export-body">
        <aside className="export-options">
          <Select
            label={t("File format")}
            value={format}
            options={[
              { id: "PDF", label: t("PDF - print and read") },
              { id: "ICS", label: t("iCalendar - calendar applications") },
              { id: "CSV", label: t("CSV - spreadsheets") },
              { id: "JSON", label: t("JSON - complete recovery archive") },
            ]}
            onChange={setFormat}
          />
          {format !== "JSON" ? (
            <>
              {format === "PDF" && (
                <PrintProfileControls
                  archive={archive}
                  options={o}
                  presentation={p}
                  onLegacy={restore}
                  onLoad={(options, presentation) => {
                    setO(options);
                    setP(presentation);
                    setPrivacy(false);
                    setPreset("CUSTOM");
                    setFocus(options.start);
                  }}
                />
              )}
              <Select
                label={t("Export preset")}
                value={preset}
                options={[
                  "FULL",
                  "CLOSINGS",
                  "PERSONAL",
                  "DEPARTMENT",
                  "ABSENCE_REST",
                  "CUSTOM",
                ].map((id) => ({
                  id,
                  label: t(
                    {
                      FULL: "Complete calendar",
                      CLOSINGS: "Closing or special duties",
                      PERSONAL: "Personal calendar",
                      DEPARTMENT: "Department printout",
                      ABSENCE_REST: "Absences and rest only",
                      CUSTOM: "Custom selection",
                    }[id]!,
                  ),
                }))}
                onChange={(value) => {
                  setPreset(value);
                  setO(presetOptions(value, archive, o));
                  setPrivacy(false);
                }}
              />
              {preset === "CLOSINGS" &&
                archive.scenario.shifts.some(
                  (sh) => sh.fairnessTags?.length,
                ) && (
                  <Select
                    label={t("Duty category")}
                    value={
                      archive.scenario.shifts.find((sh) =>
                        o.shiftSelection.shiftIds.includes(sh.id),
                      )?.fairnessTags?.[0] ?? ""
                    }
                    options={[
                      ...new Set(
                        archive.scenario.shifts.flatMap(
                          (sh) => sh.fairnessTags ?? [],
                        ),
                      ),
                    ].map((tag) => ({
                      id: tag,
                      label:
                        archive.scenario.policies.find((policy) =>
                          policy.objective.fairnessTags?.includes(tag),
                        )?.label ??
                        archive.scenario.shifts
                          .filter((sh) => sh.fairnessTags?.includes(tag))
                          .map((sh) => sh.label)
                          .join(" / "),
                    }))}
                    onChange={(tag) =>
                      setO((prev) => ({
                        ...prev,
                        shiftSelection: {
                          ...prev.shiftSelection,
                          mode: "MANUAL",
                          shiftIds: archive.scenario.shifts
                            .filter((sh) => sh.fairnessTags?.includes(tag))
                            .map((sh) => sh.id),
                        },
                      }))
                    }
                  />
                )}
              <details open>
                <summary>{t("Period and people")}</summary>
                <Text
                  label={t("Selected date")}
                  type="date"
                  value={focus}
                  onChange={setFocus}
                />
                <div className="row">
                  {(["ALL", "WEEK", "MONTH"] as const).map((kind) => (
                    <button
                      key={kind}
                      onClick={() =>
                        update((d) => {
                          Object.assign(
                            d,
                            shortcutPeriod(kind, focus, archive),
                          );
                        })
                      }
                    >
                      {t(
                        kind === "ALL"
                          ? "Whole calendar"
                          : kind === "WEEK"
                            ? "Selected week"
                            : "Selected month",
                      )}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <Text
                    label={t("Export starts")}
                    type="date"
                    value={o.start}
                    onChange={(v) =>
                      update((d) => {
                        d.start = v;
                      })
                    }
                  />
                  <Text
                    label={t("Export ends")}
                    type="date"
                    value={o.end}
                    onChange={(v) =>
                      update((d) => {
                        d.end = v;
                      })
                    }
                  />
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={o.employeeSelection.all}
                    onChange={(e) =>
                      update((d) => {
                        d.employeeSelection.all = e.target.checked;
                      })
                    }
                  />
                  {t("All employees")}
                </label>
                {!o.employeeSelection.all && (
                  <>
                    <Text
                      label={t("Find a person")}
                      value={query}
                      onChange={setQuery}
                    />
                    <div className="row">
                      <button
                        onClick={() =>
                          update((d) => {
                            d.employeeSelection.employeeIds =
                              archive.scenario.employees
                                .filter((e) =>
                                  e.label
                                    .toLowerCase()
                                    .includes(query.toLowerCase()),
                                )
                                .map((e) => e.id);
                          })
                        }
                      >
                        {t("Select shown people")}
                      </button>
                      <button
                        onClick={() =>
                          update((d) => {
                            d.employeeSelection.employeeIds = [];
                            d.employeeSelection.typeIds = [];
                            d.employeeSelection.groupIds = [];
                          })
                        }
                      >
                        {t("Clear selection")}
                      </button>
                    </div>
                    <Multi
                      showIdentifiers={false}
                      label={t("People to include")}
                      values={o.employeeSelection.employeeIds}
                      options={archive.scenario.employees.filter((e) =>
                        e.label.toLowerCase().includes(query.toLowerCase()),
                      )}
                      onChange={(v) =>
                        update((d) => {
                          d.employeeSelection.employeeIds = v;
                        })
                      }
                    />
                    <Multi
                      showIdentifiers={false}
                      label={t("Include professional roles")}
                      values={o.employeeSelection.typeIds}
                      options={archive.scenario.employeeTypes}
                      onChange={(v) =>
                        update((d) => {
                          d.employeeSelection.typeIds = v;
                        })
                      }
                    />
                    {archive.scenario.groups.length > 0 && (
                      <Multi
                        showIdentifiers={false}
                        label={t("Include configured groups")}
                        values={o.employeeSelection.groupIds}
                        options={archive.scenario.groups}
                        onChange={(v) =>
                          update((d) => {
                            d.employeeSelection.groupIds = v;
                          })
                        }
                      />
                    )}
                    <p className="hint">
                      {t(
                        "Names, roles and groups add people to the selection. Dated role and group membership is respected on each date.",
                      )}
                    </p>
                  </>
                )}
              </details>
              <details>
                <summary>{t("Shifts and availability")}</summary>
                <Select
                  label={t("Visible working shifts")}
                  value={o.shiftSelection.mode}
                  options={["ALL", "WORKING", "SPECIAL", "MANUAL"].map(
                    (id) => ({
                      id,
                      label: t(
                        {
                          ALL: "All shifts",
                          WORKING: "Working shifts",
                          SPECIAL: "Special shifts",
                          MANUAL: "Choose shifts",
                        }[id]!,
                      ),
                    }),
                  )}
                  onChange={(v) =>
                    update((d) => {
                      d.shiftSelection.mode =
                        v as ViewOptions["shiftSelection"]["mode"];
                    })
                  }
                />
                {o.shiftSelection.mode === "MANUAL" && (
                  <Multi
                    showIdentifiers={false}
                    label={t("Shift selection")}
                    values={o.shiftSelection.shiftIds}
                    options={archive.scenario.shifts.filter(
                      (sh) => sh.kind === "WORKING",
                    )}
                    onChange={(v) =>
                      update((d) => {
                        d.shiftSelection.shiftIds = v;
                      })
                    }
                  />
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={o.shiftSelection.hideNormal}
                    onChange={(e) =>
                      update((d) => {
                        d.shiftSelection.hideNormal = e.target.checked;
                      })
                    }
                  />
                  {t("Hide normal work")}
                </label>
                <Multi
                  showIdentifiers={false}
                  label={t("These shifts mean normal work")}
                  values={o.shiftSelection.normalShiftIds}
                  options={archive.scenario.shifts.filter(
                    (sh) => sh.kind === "WORKING",
                  )}
                  onChange={(v) =>
                    update((d) => {
                      d.shiftSelection.normalShiftIds = v;
                    })
                  }
                />
                {(
                  [
                    "showAbsences",
                    "showRest",
                    "showClosuresAndHolidays",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={o[key]}
                      onChange={(e) =>
                        update((d) => {
                          d[key] = e.target.checked;
                        })
                      }
                    />
                    {t(
                      key === "showAbsences"
                        ? "Show unavailability"
                        : key === "showRest"
                          ? "Show rest"
                          : "Show closures and holidays",
                    )}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={privacy}
                    onChange={(e) => {
                      setPrivacy(e.target.checked);
                      update((d) => {
                        d.includeAbsenceReasons = e.target.checked;
                      });
                    }}
                  />
                  {t("I am authorized to include existing absence reasons")}
                </label>
                <p className="hint">
                  {t(
                    "Shared calendars use generic unavailability by default. No reason is inferred when it is missing.",
                  )}
                </p>
              </details>
              {format === "PDF" && (
                <>
                  <fieldset className="print-day-filters">
                    <legend>{t("Days to omit from PDF")}</legend>
                    <p className="hint">
                      {t(
                        "Omit dates matching any checked category. Dates with actual work anywhere in the source calendar are always kept, even when a person or shift is hidden by a filter.",
                      )}
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={Object.keys(pdfDayCategories).every((key) =>
                          p.excludedDayCategories?.includes(
                            key as PdfDayCategory,
                          ),
                        )}
                        onChange={(e) =>
                          setP({
                            ...p,
                            excludedDayCategories: e.target.checked
                              ? (Object.keys(
                                  pdfDayCategories,
                                ) as PdfDayCategory[])
                              : [],
                          })
                        }
                      />
                      {t("Exclude all days with no work")}
                    </label>
                    {Object.entries(pdfDayCategories).map(
                      ([category, label]) => (
                        <label key={category}>
                          <input
                            type="checkbox"
                            checked={
                              p.excludedDayCategories?.includes(
                                category as PdfDayCategory,
                              ) ?? false
                            }
                            onChange={(e) =>
                              setP({
                                ...p,
                                excludedDayCategories: e.target.checked
                                  ? [
                                      ...(p.excludedDayCategories ?? []),
                                      category as PdfDayCategory,
                                    ]
                                  : (p.excludedDayCategories ?? []).filter(
                                      (value) => value !== category,
                                    ),
                              })
                            }
                          />
                          {t(label)}
                        </label>
                      ),
                    )}
                  </fieldset>
                  <details open>
                    <summary>{t("PDF layout")}</summary>
                    <Select
                      label={t("Cell detail")}
                      value={p.mode}
                      options={[
                        { id: "COMPACT", label: t("Compact - shift labels") },
                        { id: "COMPLETE", label: t("Complete - actual hours") },
                      ]}
                      onChange={(v) =>
                        setP({ ...p, mode: v as Presentation["mode"] })
                      }
                    />
                    <Select
                      label={t("Page layout")}
                      value={p.layout}
                      options={[
                        { id: "WEEK", label: t("Weekly grid") },
                        { id: "MONTH", label: t("Monthly grid") },
                        { id: "PERSON", label: t("List by employee") },
                      ]}
                      onChange={(v) =>
                        setP({ ...p, layout: v as Presentation["layout"] })
                      }
                    />
                    <div className="row">
                      <Select
                        label={t("Paper size")}
                        value={p.paper}
                        options={[
                          { id: "A4", label: "A4" },
                          { id: "A3", label: "A3" },
                        ]}
                        onChange={(v) =>
                          setP({ ...p, paper: v as Presentation["paper"] })
                        }
                      />
                      <Select
                        label={t("Orientation")}
                        value={p.orientation}
                        options={[
                          { id: "AUTO", label: t("Automatic") },
                          { id: "PORTRAIT", label: t("Portrait") },
                          { id: "LANDSCAPE", label: t("Landscape") },
                        ]}
                        onChange={(v) =>
                          setP({
                            ...p,
                            orientation: v as Presentation["orientation"],
                          })
                        }
                      />
                    </div>
                    <details>
                      <summary>{t("Document heading and notes")}</summary>
                      {(["business", "title", "notes"] as const).map((key) => (
                        <Text
                          key={key}
                          label={t(
                            key === "business"
                              ? "Business name"
                              : key === "title"
                                ? "Custom title"
                                : "Operational notes",
                          )}
                          value={p[key]}
                          onChange={(v) => setP({ ...p, [key]: v })}
                        />
                      ))}
                      <label>
                        <input
                          type="checkbox"
                          checked={p.showPublishedDate}
                          onChange={(e) =>
                            setP({ ...p, showPublishedDate: e.target.checked })
                          }
                        />
                        {t("Show publication date")}
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={p.showRevision}
                          onChange={(e) =>
                            setP({ ...p, showRevision: e.target.checked })
                          }
                        />
                        {t("Show revision")}
                      </label>
                    </details>
                  </details>
                </>
              )}
              {format === "ICS" && (
                <>
                  <Select
                    label={t("Calendar files")}
                    value={p.icsMode}
                    options={[
                      { id: "COLLECTIVE", label: t("One collective calendar") },
                      {
                        id: "INDIVIDUAL",
                        label: t("Separate personal calendars"),
                      },
                    ]}
                    onChange={(v) =>
                      setP({ ...p, icsMode: v as Presentation["icsMode"] })
                    }
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={p.includeTimesInDescription}
                      onChange={(e) =>
                        setP({
                          ...p,
                          includeTimesInDescription: e.target.checked,
                        })
                      }
                    />
                    {t("Include actual hours in descriptions")}
                  </label>
                  <p className="hint">
                    {t(
                      "Each separate work interval is a separate event. Manual file import is not synchronization; calendar apps may retain events removed by a later file.",
                    )}
                  </p>
                </>
              )}
            </>
          ) : (
            <p>
              {t(
                "This saves the complete original calendar with all employees, assignments, history and context. View filters do not apply. Only this archive can be used for recovery and historical continuity.",
              )}
            </p>
          )}
        </aside>
        <section className="export-preview" aria-live="polite">
          {error && (
            <p role="alert" className="error">
              {localizeError(error)}
            </p>
          )}
          {loading && <p role="status">{t("Preparing export preview...")}</p>}
          {format === "JSON" ? (
            <p>
              {t(
                "Complete RosterCore archive. The original integrity checks and lifecycle are preserved.",
              )}
            </p>
          ) : (
            view && (
              <>
                <p className="export-selection-count">
                  {t("Exporting {selected} of {total} employees", {
                    selected: view.employees.length,
                    total: view.totalEmployees,
                  })}{" "}
                  · {o.start} - {o.end}
                </p>
                {format === "PDF" && (
                  <p>
                    {t("Printing {printed} of {total} dates", {
                      printed: calendarPrintView(view, p).days.length,
                      total: view.days.length,
                    })}
                  </p>
                )}
                {format === "PDF" ? (
                  pdf && <PdfPreview pages={pdf.pages} />
                ) : (
                  <CalendarGrid view={view} mode={p.mode} />
                )}
              </>
            )
          )}
        </section>
      </div>
      <footer className="export-footer">
        <button onClick={onClose}>{t("Cancel")}</button>
        <button
          className="primary"
          disabled={
            format !== "JSON" &&
            (readyKey !== selectionKey ||
              loading ||
              Boolean(error) ||
              !view?.employees.length ||
              (format === "PDF" && !pdf))
          }
          onClick={save}
        >
          {downloadLabel}
        </button>
      </footer>
    </dialog>
  );
}
