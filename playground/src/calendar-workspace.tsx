import { WorkCompletion } from "./work-completion";
import { useEffect, useRef, useState } from "react";
import type { Scenario, Result } from "./model";
import type { ScheduleArchive } from "./archives";
import {
  type CalendarView,
  type ViewOptions,
  type CalendarCell,
  defaultViewOptions,
  shortcutPeriod,
  cellText,
  archiveStatus,
} from "./calendar-export-model";
import { CalendarGrid } from "./calendar-view";
import { ExportDialog } from "./calendar-export-dialog";
import { CalendarChanges } from "./calendar-changes";
import { AIConfiguration } from "./ai-configuration";
import { Text, Select, Multi } from "./editors";
import { useI18n } from "./i18n";
import { coreAction } from "./api";
import type { Run } from "./results";
export function operationalState({
  s,
  r,
  archive,
  stale,
  validated = false,
}: {
  s: Scenario;
  r?: Result;
  archive?: ScheduleArchive;
  stale: boolean;
  validated?: boolean;
}) {
  if (stale) return "Needs updating";
  if (
    r &&
    ["VALIDATION_ERROR", "MODEL_INVALID", "INFEASIBLE"].includes(r.status)
  )
    return "Needs correction";
  if (r?.status === "UNKNOWN") return "Calendar needs review";
  if (
    archive?.state === "PUBLISHED" ||
    (archive?.state === "COMPLETED" &&
      archive.publishedLocks.some(
        (a) => !archive.completedThrough || a.date > archive.completedThrough,
      ))
  )
    return "Published";
  if (r?.assignments)
    return r.status === "FEASIBLE" ||
      r.diagnostics.some((d) => d.severity === "WARNING")
      ? "Calendar needs review"
      : "Calendar generated";
  return validated ? "Can generate" : "Needs setup";
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="calendar-context-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="section-head">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label={title + " - close"}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function CalendarWorkspace({
  s,
  r,
  archive,
  archives,
  currentScenario,
  previous,
  stale,
  busy,
  run,
  publish,
  simple = false,
  validated = false,
  onConfigure,
}: {
  s: Scenario;
  r?: Result;
  archive?: ScheduleArchive;
  archives: ScheduleArchive[];
  currentScenario: Scenario;
  previous?: Result;
  stale: boolean;
  busy: boolean;
  run: Run;
  publish: () => void;
  simple?: boolean;
  validated?: boolean;
  onConfigure?: () => void;
}) {
  const { t, diagnostic } = useI18n();
  const [exporting, setExporting] = useState(false),
    [completing, setCompleting] = useState(false),
    [changing, setChanging] = useState(false),
    [changeAction, setChangeAction] = useState("ABSENCE"),
    [ai, setAi] = useState(false),
    [cell, setCell] = useState<CalendarCell>(),
    [view, setView] = useState<CalendarView>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [detail, setDetail] = useState(false),
    [focus, setFocus] = useState(archive?.period.start ?? s.calendar.start),
    [mode, setMode] = useState("week");
  const [filters, setFilters] = useState<ViewOptions | undefined>(() =>
      archive ? defaultViewOptions(archive) : undefined,
    ),
    [query, setQuery] = useState(""),
    [complete, setComplete] = useState(true);
  useEffect(() => {
    if (!archive) return;
    setView(undefined);
    let options = defaultViewOptions(archive),
      selectedMode = "week",
      at = archive.period.start;
    try {
      const saved = JSON.parse(
        localStorage.getItem("rostercore.calendar-view.v1") ?? "null",
      );
      if (saved?.scenarioId === archive.scenarioId) {
        selectedMode = saved.mode;
        at =
          saved.focus >= archive.period.start &&
          saved.focus <= archive.period.end
            ? saved.focus
            : at;
        if (saved.filters) {
          options = {
            ...options,
            ...saved.filters,
            employeeSelection: {
              ...options.employeeSelection,
              ...saved.filters.employeeSelection,
            },
            shiftSelection: {
              ...options.shiftSelection,
              ...saved.filters.shiftSelection,
            },
            includeAbsenceReasons: false,
          };
          options.employeeSelection.employeeIds =
            options.employeeSelection.employeeIds.filter((id) =>
              archive.scenario.employees.some((e) => e.id === id),
            );
          options.employeeSelection.typeIds =
            options.employeeSelection.typeIds.filter((id) =>
              archive.scenario.employeeTypes.some((e) => e.id === id),
            );
          options.employeeSelection.groupIds =
            options.employeeSelection.groupIds.filter((id) =>
              archive.scenario.groups.some((e) => e.id === id),
            );
          options.shiftSelection.shiftIds =
            options.shiftSelection.shiftIds.filter((id) =>
              archive.scenario.shifts.some((sh) => sh.id === id),
            );
          options.shiftSelection.normalShiftIds =
            options.shiftSelection.normalShiftIds.filter((id) =>
              archive.scenario.shifts.some((sh) => sh.id === id),
            );
        }
      }
    } catch {}
    setMode(selectedMode);
    setFocus(at);
    setFilters(options);
  }, [archive?.id]);
  useEffect(() => {
    if (!archive || !filters) return;
    let active = true;
    setLoading(true);
    setError("");
    const options = {
      ...filters,
      ...(mode === "horizon"
        ? archive.period
        : mode === "day"
          ? { start: focus, end: focus }
          : shortcutPeriod(
              mode === "month" ? "MONTH" : "WEEK",
              focus,
              archive,
            )),
    };
    const timer = setTimeout(async () => {
      try {
        const result = await coreAction(
          "archives",
          archive.scenario,
          {
            document: {
              operation: "VIEW",
              id: archive.id,
              archives: [archive],
              options,
              dryRun: false,
            },
          },
          { silent: true },
        );
        if (result.status !== "EXPORTED")
          throw new Error(
            result.diagnostics.map((d) => diagnostic(d)).join("\n"),
          );
        if (active) {
          setView(result.document as CalendarView);
          setLoading(false);
        }
        try {
          localStorage.setItem(
            "rostercore.calendar-view.v1",
            JSON.stringify({
              scenarioId: archive.scenarioId,
              mode,
              focus,
              filters,
            }),
          );
        } catch {}
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [archive, filters, mode, focus]);
  const update = (fn: (o: ViewOptions) => void) =>
    setFilters((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const state = operationalState({
    s: currentScenario,
    r,
    archive,
    stale,
    validated,
  });
  const substitutions = r?.quality?.fallback.totalSubstitutions ?? 0;
  const sameScenario = !archive || archive.scenarioId === currentScenario.id;
  const dateList = new Set(view?.days.map((d) => d.date));
  const selectedPeople = new Set(view?.employees.map((e) => e.id));
  const assignments = new Map(
    r?.assignments?.map((a) => [a.employeeId + ":" + a.date, a]),
  );
  const old = new Map(
    previous?.assignments?.map((a) => [a.employeeId + ":" + a.date, a]),
  );
  const changes =
    r?.changes ??
    (previous?.assignments
      ? [...new Set([...assignments.keys(), ...old.keys()])]
          .filter(
            (key) =>
              JSON.stringify(assignments.get(key)) !==
              JSON.stringify(old.get(key)),
          )
          .map((key) => {
            const a = assignments.get(key),
              before = old.get(key);
            return {
              employeeId: a?.employeeId ?? before!.employeeId,
              date: a?.date ?? before!.date,
              beforeShiftId: before?.shiftId ?? null,
              afterShiftId: a?.shiftId ?? null,
              beforeIntervals: before?.intervals,
              afterIntervals: a?.intervals,
            };
          })
      : []);
  const dutyIds = new Set(
    s.shifts
      .filter(
        (sh) =>
          sh.kind === "WORKING" &&
          !filters?.shiftSelection.normalShiftIds.includes(sh.id),
      )
      .map((sh) => sh.id),
  );
  const labels = (shift: string | null) =>
    s.shifts.find((sh) => sh.id === shift)?.label ?? t("No assignment");
  return (
    <section className="calendar-workspace">
      <div className="calendar-heading">
        <div>
          <h2>{t("Assignment calendar")}</h2>
          <p>
            {archive
              ? archive.period.start + " - " + archive.period.end
              : s.calendar.start + " - " + s.calendar.end}
          </p>
        </div>
        <p className="operational-status" role="status">
          {t(state)}
        </p>
      </div>
      {stale && (
        <p className="notice">
          {t(
            "The displayed calendar uses an earlier configuration. Regenerate the affected future dates before publishing changes.",
          )}
        </p>
      )}
      {r?.status === "FEASIBLE" && (
        <p className="notice">
          {t(
            "The calendar can be used, but some preferences may still be improved. Review it before publishing.",
          )}
        </p>
      )}
      {substitutions > 0 && (
        <p className="notice">
          {t("{count} substitute assignments need your attention.", {
            count: substitutions,
          })}{" "}
          <button onClick={() => setDetail(true)}>{t("Details")}</button>
        </p>
      )}
      {r &&
        ["INFEASIBLE", "UNKNOWN", "VALIDATION_ERROR", "MODEL_INVALID"].includes(
          r.status,
        ) && (
          <p role="alert" className="error">
            {t(
              r.status === "INFEASIBLE"
                ? "No calendar can satisfy the current requirements. Review availability and required coverage."
                : r.status === "UNKNOWN"
                  ? "No usable calendar was found in the available time. Review the setup or try again."
                  : "Correct the configuration errors before generating a calendar.",
            )}{" "}
            <button onClick={() => setDetail(true)}>{t("Details")}</button>
          </p>
        )}
      <div className="calendar-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => run("solve")}
        >
          {t(busy ? "Working…" : "Generate schedule")}
        </button>
        {archive && (
          <>
            <button onClick={() => setExporting(true)}>
              {t("Export calendar")}
            </button>
            <button
              disabled={
                stale || !sameScenario || archive.state === "SUPERSEDED"
              }
              onClick={publish}
            >
              {t("Publish calendar")}
            </button>
            <button
              disabled={!sameScenario || busy}
              onClick={() => {
                setCell(undefined);
                setChangeAction("ABSENCE");
                setChanging(true);
              }}
            >
              {t("Modify planning")}
            </button>
          </>
        )}
        {!archive && onConfigure && (
          <button onClick={onConfigure}>{t("Configure the team")}</button>
        )}
        <button onClick={() => setAi(true)}>{t("Ask AI for help")}</button>
      </div>
      {archive && filters && (
        <>
          <div className="calendar-view-controls">
            <Select
              label={t("Calendar view")}
              value={mode}
              options={[
                { id: "day", label: t("Day") },
                { id: "week", label: t("Week") },
                { id: "month", label: t("Month") },
                { id: "horizon", label: t("Whole horizon") },
              ]}
              onChange={setMode}
            />
            {mode !== "horizon" && (
              <Text
                label={t("Focus date")}
                type="date"
                value={focus}
                onChange={(v) => {
                  if (v >= archive.period.start && v <= archive.period.end)
                    setFocus(v);
                }}
              />
            )}
            <label>
              <input
                type="checkbox"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
              />
              {t("Show actual hours")}
            </label>
            <button
              onClick={() =>
                update((o) => {
                  o.shiftSelection.hideNormal = !o.shiftSelection.hideNormal;
                })
              }
              disabled={!filters.shiftSelection.normalShiftIds.length}
            >
              {t(
                filters.shiftSelection.hideNormal
                  ? "Show normal work"
                  : "Hide normal work",
              )}
            </button>
          </div>
          <details className="calendar-filters">
            <summary>{t("Filter people and shifts")}</summary>
            <Text
              label={t("Search people, shifts or a week")}
              value={query}
              onChange={(q) => {
                setQuery(q);
                const date = q.match(/\d{4}-\d{2}-\d{2}/)?.[0];
                if (
                  date &&
                  date >= archive.period.start &&
                  date <= archive.period.end
                ) {
                  setFocus(date);
                  setMode("week");
                }
              }}
            />
            {query.trim() && !/\d{4}-\d{2}-\d{2}/.test(query) && (
              <div className="row" aria-label={t("Search results")}>
                {s.employees
                  .filter((e) =>
                    e.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .slice(0, 10)
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        update((o) => {
                          o.employeeSelection = {
                            all: false,
                            employeeIds: [e.id],
                            typeIds: [],
                            groupIds: [],
                          };
                        });
                        setQuery("");
                      }}
                    >
                      {e.label}
                    </button>
                  ))}
                {s.shifts
                  .filter(
                    (sh) =>
                      sh.kind === "WORKING" &&
                      sh.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((sh) => (
                    <button
                      key={sh.id}
                      onClick={() => {
                        update((o) => {
                          o.shiftSelection.mode = "MANUAL";
                          o.shiftSelection.shiftIds = [sh.id];
                          o.shiftSelection.hideNormal = false;
                        });
                        setQuery("");
                      }}
                    >
                      {sh.label}
                    </button>
                  ))}
              </div>
            )}
            <label>
              <input
                type="checkbox"
                checked={filters.employeeSelection.all}
                onChange={(e) =>
                  update((o) => {
                    o.employeeSelection.all = e.target.checked;
                  })
                }
              />
              {t("All employees")}
            </label>
            {!filters.employeeSelection.all && (
              <>
                <Multi
                  showIdentifiers={false}
                  label={t("People to include")}
                  values={filters.employeeSelection.employeeIds}
                  options={s.employees.filter((e) =>
                    e.label.toLowerCase().includes(query.toLowerCase()),
                  )}
                  onChange={(v) =>
                    update((o) => {
                      o.employeeSelection.employeeIds = v;
                    })
                  }
                />
                <Multi
                  showIdentifiers={false}
                  label={t("Include professional roles")}
                  values={filters.employeeSelection.typeIds}
                  options={s.employeeTypes}
                  onChange={(v) =>
                    update((o) => {
                      o.employeeSelection.typeIds = v;
                    })
                  }
                />
                {s.groups.length > 0 && (
                  <Multi
                    showIdentifiers={false}
                    label={t("Include configured groups")}
                    values={filters.employeeSelection.groupIds}
                    options={s.groups}
                    onChange={(v) =>
                      update((o) => {
                        o.employeeSelection.groupIds = v;
                      })
                    }
                  />
                )}
              </>
            )}
            <Select
              label={t("Visible working shifts")}
              value={filters.shiftSelection.mode}
              options={[
                { id: "ALL", label: t("All shifts") },
                { id: "WORKING", label: t("Working shifts") },
                { id: "SPECIAL", label: t("Special shifts") },
                { id: "MANUAL", label: t("Choose shifts") },
              ]}
              onChange={(v) =>
                update((o) => {
                  o.shiftSelection.mode =
                    v as ViewOptions["shiftSelection"]["mode"];
                })
              }
            />
            {filters.shiftSelection.mode === "MANUAL" && (
              <Multi
                showIdentifiers={false}
                label={t("Shift selection")}
                values={filters.shiftSelection.shiftIds}
                options={s.shifts.filter(
                  (sh) =>
                    sh.kind === "WORKING" &&
                    sh.label.toLowerCase().includes(query.toLowerCase()),
                )}
                onChange={(v) =>
                  update((o) => {
                    o.shiftSelection.shiftIds = v;
                  })
                }
              />
            )}
            <Multi
              showIdentifiers={false}
              label={t("These shifts mean normal work")}
              values={filters.shiftSelection.normalShiftIds}
              options={s.shifts.filter((sh) => sh.kind === "WORKING")}
              onChange={(v) =>
                update((o) => {
                  o.shiftSelection.normalShiftIds = v;
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={filters.showAbsences}
                onChange={(e) =>
                  update((o) => {
                    o.showAbsences = e.target.checked;
                  })
                }
              />
              {t("Show unavailability")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.showRest}
                onChange={(e) =>
                  update((o) => {
                    o.showRest = e.target.checked;
                  })
                }
              />
              {t("Show rest")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.showClosuresAndHolidays}
                onChange={(e) =>
                  update((o) => {
                    o.showClosuresAndHolidays = e.target.checked;
                  })
                }
              />
              {t("Show closures and holidays")}
            </label>
          </details>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {loading && !view && <p>{t("Loading calendar...")}</p>}
          {view && (
            <CalendarGrid
              view={view}
              mode={complete ? "COMPLETE" : "COMPACT"}
              onCell={(c) => setCell(c)}
            />
          )}
          <details className="duty-counts">
            <summary>{t("View duty distribution")}</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Employee")}</th>
                    {[...dutyIds].map((id) => (
                      <th key={id}>{labels(id)}</th>
                    ))}
                    <th>{t("Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {view?.employees.map((employee) => {
                    const rows = (r?.assignments ?? []).filter(
                      (a) =>
                        a.employeeId === employee.id &&
                        dateList.has(a.date) &&
                        dutyIds.has(a.shiftId) &&
                        view.cells.find(
                          (c) =>
                            c.employeeId === employee.id && c.date === a.date,
                        )?.state !== "FILTERED_PERSON",
                    );
                    return (
                      <tr key={employee.id}>
                        <td>{employee.label}</td>
                        {[...dutyIds].map((id) => (
                          <td key={id}>
                            {rows.filter((a) => a.shiftId === id).length}
                          </td>
                        ))}
                        <td>{rows.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          {changes.length > 0 && (
            <details
              className="calendar-differences"
              open={Boolean(r?.changes?.length)}
            >
              <summary>
                {t("Review {count} changed assignments", {
                  count: changes.length,
                })}
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Employee")}</th>
                      <th>{t("Date")}</th>
                      <th>{t("Before")}</th>
                      <th>{t("After")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes
                      .filter(
                        (c) =>
                          !view ||
                          (selectedPeople.has(c.employeeId) &&
                            dateList.has(c.date)),
                      )
                      .map((c, i) => (
                        <tr key={i}>
                          <td>
                            {s.employees.find((e) => e.id === c.employeeId)
                              ?.label ?? c.employeeId}
                          </td>
                          <td>{c.date}</td>
                          <td>
                            {labels(c.beforeShiftId)}{" "}
                            {(c.beforeIntervals ?? [])
                              .map((i) => i.start + "-" + i.end)
                              .join(" / ")}
                          </td>
                          <td>
                            {labels(c.afterShiftId)}{" "}
                            {(c.afterIntervals ?? [])
                              .map((i) => i.start + "-" + i.end)
                              .join(" / ")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <details className="calendar-secondary">
            <summary>{t("More calendar actions")}</summary>
            <button onClick={() => setCompleting(true)}>
              {t("Record work performed")}
            </button>
            <button
              onClick={() => {
                setCell(undefined);
                setChangeAction("REGENERATE");
                setChanging(true);
              }}
              disabled={!sameScenario}
            >
              {t("Regenerate future dates")}
            </button>
            <button onClick={() => setDetail(true)}>
              {t("Diagnostics and verification")}
            </button>
          </details>
        </>
      )}
      {cell && (
        <Dialog
          title={
            (s.employees.find((e) => e.id === cell.employeeId)?.label ?? "") +
            " - " +
            cell.date
          }
          onClose={() => setCell(undefined)}
        >
          <p>{cellText(cell, t, true)}</p>
          {r?.coverage
            ?.filter((row) =>
              row.people.some(
                (p) => p.employeeId === cell.employeeId && p.date === cell.date,
              ),
            )
            .map((row) => (
              <p key={row.requirementId}>
                {t("Assigned responsibility")}: {row.label}
              </p>
            ))}
          {r?.quality?.substitutions
            .filter(
              (row) =>
                row.employeeId === cell.employeeId && row.date === cell.date,
            )
            .map((row, i) => (
              <p key={i}>
                {t(
                  row.minimumProved
                    ? "The global substitute minimum was proved; this person is not necessarily the only possible choice."
                    : "This substitute assignment is feasible; its necessity has not been proved.",
                )}
              </p>
            ))}
          <div className="row">
            <button
              disabled={!sameScenario}
              onClick={() => {
                setChangeAction("ABSENCE");
                setChanging(true);
              }}
            >
              {t("Record unavailability from this date")}
            </button>
            <button onClick={() => setAi(true)}>
              {t("Ask AI about this assignment")}
            </button>
          </div>
        </Dialog>
      )}
      {completing && archive && (
        <WorkCompletion
          archive={archive}
          run={run}
          onClose={() => setCompleting(false)}
        />
      )}
      {changing && (
        <CalendarChanges
          s={currentScenario}
          archive={archive}
          archives={archives}
          initialCell={cell}
          initialAction={changeAction}
          run={run}
          onClose={() => {
            setChanging(false);
            setCell(undefined);
          }}
        />
      )}
      {exporting && archive && (
        <ExportDialog
          archive={archive}
          initial={view?.options}
          onClose={() => setExporting(false)}
        />
      )}
      {ai && (
        <Dialog title={t("Ask AI for help")} onClose={() => setAi(false)}>
          <AIConfiguration
            s={sameScenario ? currentScenario : s}
            run={run}
            busy={busy}
            archives={archives}
            scope={{
              start: cell?.date ?? view?.period.start ?? s.calendar.start,
              end: cell?.date ?? view?.period.end ?? s.calendar.end,
              employeeIds: cell ? [cell.employeeId] : view?.employees.map(e=>e.id)??[],
              shiftIds: cell?.shiftId ? [cell.shiftId] : [],
              diagnostics: [],
            }}
          />
        </Dialog>
      )}
      {detail && (
        <Dialog
          title={t("Diagnostics and verification")}
          onClose={() => setDetail(false)}
        >
          <p>
            {t(
              "Technical details are optional. They do not change the calendar or publish it.",
            )}
          </p>
          <button onClick={() => run("verify", { scenario: s, result: r })}>
            {t("Verify independently")}
          </button>
          <button
            onClick={() => run("verify-quality", { scenario: s, result: r })}
          >
            {t("Independently check substitute minimum")}
          </button>
          <pre>
            {JSON.stringify(
              {
                diagnostics: r?.diagnostics,
                quality: r?.quality,
                phases: r?.phases,
                fairness: r?.fairness,
                metadata: r?.metadata,
              },
              null,
              2,
            )}
          </pre>
        </Dialog>
      )}
    </section>
  );
}
