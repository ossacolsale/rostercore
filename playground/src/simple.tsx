import { CalendarWorkspace } from "./calendar-workspace";
import { AIConfiguration } from "./ai-configuration";
import { useState, type ComponentProps } from "react";
import {
  type Scenario,
  type Selector,
  type Result,
  id,
  type SpacingRule,
  download,
} from "./model";
import { Text, Select, Multi as CatalogueMulti } from "./editors";
function Multi(props: ComponentProps<typeof CatalogueMulti>) {
  return <CatalogueMulti {...props} showIdentifiers={false} />;
}
import { IntervalEditor } from "./evolution";
import { ReviewDialog } from "./pattern-assignments";
import { Results, type Run } from "./results";
import { ScheduleLibrary, type ScheduleArchive } from "./archives";
import { useI18n } from "./i18n";
import { type Update } from "./setup";
import { coreAction } from "./api";
import {
  daysOfWeek,
  simpleScenario,
  simplePolicy,
  operationalScope,
  synchronizeSimpleScopes,
} from "./simple-model";
import { isoMonday } from "./evolution-model";
import { notifyError } from "./notifications";
const questions = [
  "Who works here?",
  "When are you open?",
  "What hours can people work?",
  "How many people do you need?",
  "How should duties be shared?",
  "Your calendar",
];
export function SimpleSelector({
  s,
  value,
  onChange,
  label = "Who does this apply to?",
}: {
  s: Scenario;
  value: Selector;
  onChange: (v: Selector) => void;
  label?: string;
}) {
  const { t } = useI18n();
  const qualifications = (s.attributeDefinitions ?? []).filter(
    (a) => a.type === "BOOLEAN",
  );
  const base = structuredClone(value);
  const clauses =
    base.where?.op === "AND"
      ? [...base.where.children]
      : base.where
        ? [base.where]
        : [];
  const qualifying = clauses.find(
    (c) =>
      c.op === "EQ" &&
      c.value === true &&
      qualifications.some((a) => a.id === c.attributeId),
  );
  const qualification = qualifying?.op === "EQ" ? qualifying.attributeId : "";
  if (qualifying) {
    const rest = clauses.filter((c) => c !== qualifying);
    if (!rest.length) delete base.where;
    else if (rest.length === 1) base.where = rest[0];
    else base.where = { op: "AND", children: rest };
  }
  const emit = (next: Selector, qual = qualification) => {
    if (qual) {
      const condition = { op: "EQ" as const, attributeId: qual, value: true };
      next = {
        ...next,
        where: next.where
          ? { op: "AND", children: [next.where, condition] }
          : condition,
      };
    }
    onChange(next);
  };
  const [multiple, setMultiple] = useState(
    Boolean(value.typeIds && value.typeIds.length !== 1),
  );
  const options = [
    { id: "all", label: t("Everyone") },
    { id: "roles", label: t("Choose several roles") },
    ...s.groups.map((g) => ({ id: "group:" + g.id, label: g.label })),
    ...s.employeeTypes.map((x) => ({
      id: "role:" + x.id,
      label: t("Role") + ": " + x.label,
    })),
    ...(s.attributeDefinitions ?? [])
      .filter((a) => a.type === "ENUM" || a.type === "BOOLEAN")
      .flatMap((a) =>
        (a.type === "BOOLEAN" ? [true, false] : (a.values ?? [])).map((v) => ({
          id: "attr:" + a.id + ":" + String(v),
          label: a.label + ": " + String(v),
        })),
      ),
    ...s.employees.map((x) => ({ id: "person:" + x.id, label: x.label })),
  ];
  let selected = Object.keys(base).length ? "custom" : "all";
  if (base.groupIds?.length === 1 && Object.keys(base).length === 1)
    selected = "group:" + base.groupIds[0];
  if (
    base.typeIds &&
    base.typeIds.length !== 1 &&
    Object.keys(base).length === 1
  )
    selected = "roles";
  if (base.typeIds?.length === 1 && Object.keys(base).length === 1)
    selected = "role:" + base.typeIds[0];
  if (base.employeeIds?.length === 1 && Object.keys(base).length === 1)
    selected = "person:" + base.employeeIds[0];
  if (base.where?.op === "EQ" && Object.keys(base).length === 1)
    selected =
      "attr:" + base.where.attributeId + ":" + String(base.where.value);
  if (multiple && base.typeIds) selected = "roles";
  return (
    <>
      <Select
        label={t(label)}
        value={selected}
        options={[
          ...options,
          ...(selected === "custom"
            ? [
                {
                  id: "custom",
                  label: t("Custom selection configured in advanced mode"),
                },
              ]
            : []),
        ]}
        onChange={(v) => {
          setMultiple(v === "roles");
          if (v === "all") emit({});
          else if (v === "roles") emit({ typeIds: [] });
          else if (v.startsWith("group:")) emit({ groupIds: [v.slice(6)] });
          else if (v.startsWith("role:")) emit({ typeIds: [v.slice(5)] });
          else if (v.startsWith("person:")) emit({ employeeIds: [v.slice(7)] });
          else if (v.startsWith("attr:")) {
            const [, a, ...parts] = v.split(":");
            const attribute = s.attributeDefinitions?.find((x) => x.id === a);
            const val = (
              attribute?.type === "BOOLEAN" ? [true, false] : attribute?.values
            )?.find((x) => String(x) === parts.join(":"));
            if (val !== undefined)
              emit(
                { where: { op: "EQ", attributeId: a, value: val } },
                attribute?.type === "BOOLEAN" ? "" : qualification,
              );
          }
        }}
      />
      {qualifications.length > 0 && (
        <Select
          label={t("Required qualification")}
          value={qualification}
          options={[
            { id: "", label: t("No extra qualification") },
            ...qualifications,
          ]}
          onChange={(qual) => emit(base, qual)}
        />
      )}
      {selected === "roles" && (
        <Multi
          label={t("Included roles")}
          values={value.typeIds ?? []}
          options={s.employeeTypes}
          onChange={(v) => emit({ typeIds: v })}
        />
      )}
    </>
  );
}
export function SimplePanel({
  s,
  update,
  replace,
  solved,
  previous,
  stale,
  busy,
  run,
  archives,
  publish,
  compare,
  validated = false,
}: {
  s: Scenario;
  validated?: boolean;
  update: Update;
  replace: (s: Scenario) => void;
  solved?: { scenario: Scenario; result: Result; archiveId?: string };
  previous?: Result;
  stale: boolean;
  busy: boolean;
  run: Run;
  archives: ScheduleArchive[];
  publish: () => void;
  compare: (r: Result) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(5),
    [pending, setPending] = useState<Scenario>(),
    [preview, setPreview] = useState<Result>(),
    [restart, setRestart] = useState(false);
  const review = async (candidate: Scenario) => {
    candidate.schemaVersion = 4;
    const r = await coreAction("validate", candidate);
    if (r.status === "VALID") {
      const inspected = await coreAction(
        "inspect-patterns",
        candidate,
        {},
        { silent: true },
      );
      if (inspected.status === "INSPECTED") {
        setPending(candidate);
        setPreview(inspected);
      }
    }
  };
  const edit: Update = (fn) =>
    update((d) => {
      d.schemaVersion = 4;
      fn(d);
    });
  return (
    <div className="simple-workspace">
      <div className="simple-heading">
        <div>
          {step < 5 && <span className="pill">{t("SIMPLE SETUP")}</span>}
          <h1>{s.label}</h1>
          {step < 5 && (
            <p>
              {t(
                "Answer six everyday questions. The calendar uses the same rules and solver as advanced mode.",
              )}
            </p>
          )}
        </div>
        <button onClick={() => setRestart(true)}>
          {t("Start a new scenario")}
        </button>
      </div>
      <nav className="simple-steps" aria-label={t("Setup questions")}>
        {questions.map((q, i) => (
          <button
            key={q}
            data-testid={"simple-step-" + i}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            {t(q)}
          </button>
        ))}
      </nav>
      {step === 0 && (
        <section className="panel">
          <h2>{t(questions[0])}</h2>
          <Text
            label={t("Scenario name")}
            value={s.label}
            onChange={(v) =>
              edit((d) => {
                d.label = v;
              })
            }
          />
          <div className="row">
            <button
              onClick={() =>
                edit((d) => {
                  d.employees.push({
                    id: id("person"),
                    label: t("New employee"),
                    typeId: d.employeeTypes[0]?.id ?? "",
                    attributes: {},
                    employment: { validFrom: d.calendar.start },
                    versions: [],
                  });
                })
              }
            >
              {t("Add employee")}
            </button>
            <button
              onClick={() =>
                edit((d) => {
                  d.employeeTypes.push({
                    id: id("role"),
                    label: t("New role"),
                  });
                })
              }
            >
              {t("Add role")}
            </button>
          </div>
          <div className="simple-grid">
            {s.employees.map((e, i) => (
              <article className="item-card" key={e.id}>
                <Text
                  label={t("Employee name")}
                  value={e.label}
                  onChange={(v) =>
                    edit((d) => {
                      d.employees[i].label = v;
                    })
                  }
                />
                <Select
                  label={t("Role")}
                  value={e.typeId}
                  options={s.employeeTypes}
                  onChange={(v) =>
                    edit((d) => {
                      d.employees[i].typeId = v;
                    })
                  }
                />
                {(s.attributeDefinitions ?? [])
                  .filter((a) => a.type === "ENUM")
                  .map((a) => (
                    <Select
                      key={a.id}
                      label={a.label}
                      value={String(e.attributes[a.id] ?? a.default ?? "")}
                      options={(a.values ?? []).map((v) => ({
                        id: String(v),
                        label: String(v),
                      }))}
                      onChange={(v) =>
                        edit((d) => {
                          d.employees[i].attributes[a.id] = v;
                        })
                      }
                    />
                  ))}
                {(s.attributeDefinitions ?? [])
                  .filter((a) => a.type === "BOOLEAN")
                  .map((a) => (
                    <label key={a.id}>
                      <input
                        type="checkbox"
                        checked={Boolean(
                          e.attributes[a.id] ?? a.default ?? false,
                        )}
                        onChange={(event) =>
                          edit((d) => {
                            d.employees[i].attributes[a.id] =
                              event.target.checked;
                          })
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                <Text
                  label={t("Employment starts")}
                  type="date"
                  value={e.employment?.validFrom ?? s.calendar.start}
                  onChange={(v) =>
                    edit((d) => {
                      d.employees[i].employment = {
                        ...d.employees[i].employment,
                        validFrom: v,
                      };
                    })
                  }
                />
                <Text
                  label={t("Employment ends, exclusive (optional)")}
                  type="date"
                  value={e.employment?.validTo ?? ""}
                  onChange={(v) =>
                    edit((d) => {
                      d.employees[i].employment ??= {
                        validFrom: d.calendar.start,
                      };
                      if (v) d.employees[i].employment!.validTo = v;
                      else delete d.employees[i].employment!.validTo;
                    })
                  }
                />
                <button
                  onClick={() =>
                    edit((d) => {
                      d.employees.splice(i, 1);
                    })
                  }
                >
                  {t("Remove employee")}
                </button>
                <details>
                  <summary>{t("Individual work-pattern override")}</summary>
                  <Select
                    label={t("Work pattern")}
                    value={e.workPatternId ?? ""}
                    options={[
                      { id: "", label: t("Use automatic rules") },
                      ...(s.workPatterns ?? []),
                    ]}
                    onChange={(v) =>
                      edit((d) => {
                        if (v) d.employees[i].workPatternId = v;
                        else delete d.employees[i].workPatternId;
                      })
                    }
                  />
                </details>
              </article>
            ))}
          </div>
          <details>
            <summary>{t("Edit role names")}</summary>
            {s.employeeTypes.map((r, i) => (
              <Text
                key={r.id}
                label={t("Role name")}
                value={r.label}
                onChange={(v) =>
                  edit((d) => {
                    d.employeeTypes[i].label = v;
                  })
                }
              />
            ))}
          </details>
          <Qualifications s={s} edit={edit} />
          <Absences s={s} edit={edit} />
        </section>
      )}
      {step === 1 && (
        <section className="panel">
          <h2>{t(questions[1])}</h2>
          <div className="row">
            <Text
              label={t("Planning starts")}
              value={s.calendar.start}
              type="date"
              onChange={(v) =>
                edit((d) => {
                  d.calendar.start = v;
                })
              }
            />
            <Text
              label={t("Planning ends")}
              value={s.calendar.end}
              type="date"
              onChange={(v) =>
                edit((d) => {
                  d.calendar.end = v;
                })
              }
            />
          </div>
          {!s.weekProfiles?.length && (
            <button
              onClick={() =>
                edit((d) => {
                  d.weekProfiles = [
                    {
                      id: id("profile"),
                      label: t("Ordinary week"),
                      offWeekdays: [6, 7],
                      holidayMode: "OFF",
                      constraintIds: [],
                      policyIds: [],
                    },
                  ];
                  d.weekConfiguration = {
                    manual: [],
                    recurrences: [],
                    frequencies: [],
                    history: [],
                    defaultProfileId: d.weekProfiles[0].id,
                  };
                })
              }
            >
              {t("Set up opening days")}
            </button>
          )}
          {s.weekProfiles?.map((p, i) => (
            <article className="item-card" key={p.id}>
              <Text
                label={t("Week type")}
                value={p.label}
                onChange={(v) =>
                  edit((d) => {
                    d.weekProfiles![i].label = v;
                  })
                }
              />
              <Multi
                label={t("Open on these weekdays")}
                values={daysOfWeek
                  .map((_, i) => i + 1)
                  .filter((d) => !p.offWeekdays.includes(d))
                  .map(String)}
                options={daysOfWeek.map((v, i) => ({
                  id: String(i + 1),
                  label: t(v),
                }))}
                onChange={(v) =>
                  edit((d) => {
                    d.weekProfiles![i].offWeekdays = [
                      1, 2, 3, 4, 5, 6, 7,
                    ].filter((x) => !v.includes(String(x)));
                    synchronizeSimpleScopes(d, p.id, s);
                  })
                }
              />
              <Select
                label={t("Is the business open on national holidays?")}
                value={p.holidayMode}
                options={[
                  { id: "OFF", label: t("No — schedule rest") },
                  {
                    id: "NORMAL",
                    label: t("Yes — use this week’s opening rules"),
                  },
                ]}
                onChange={(v) =>
                  edit((d) => {
                    d.weekProfiles![i].holidayMode = v as "OFF" | "NORMAL";
                    synchronizeSimpleScopes(d, p.id, s);
                  })
                }
              />
            </article>
          ))}
          <button
            onClick={() =>
              edit((d) => {
                d.weekProfiles ??= [];
                d.weekProfiles.push({
                  id: id("profile"),
                  label: t("Special week"),
                  offWeekdays: [],
                  holidayMode: "NORMAL",
                  constraintIds: [],
                  policyIds: [],
                });
              })
            }
          >
            {t("Add another week type")}
          </button>
          <SimpleWeeks s={s} edit={edit} />
          <Closures s={s} edit={edit} />
        </section>
      )}
      {step === 2 && (
        <section className="panel">
          <h2>{t(questions[2])}</h2>
          <p>
            {t(
              "Use one logical shift for each responsibility. Change its hours for contracts or people using an hours exception.",
            )}
          </p>
          <button
            onClick={() =>
              edit((d) => {
                d.shifts.push({
                  id: id("shift"),
                  label: t("New working shift"),
                  kind: "WORKING",
                  intervals: [
                    { start: "17:00", end: "21:00", endDayOffset: 0 },
                  ],
                  fairnessTags: [],
                });
              })
            }
          >
            {t("Add working shift")}
          </button>
          {s.shifts
            .filter((x) => x.kind === "WORKING")
            .map((sh) => (
              <article key={sh.id} className="item-card">
                <Text
                  label={t("Shift name")}
                  value={sh.label}
                  onChange={(v) =>
                    edit((d) => {
                      d.shifts.find((x) => x.id === sh.id)!.label = v;
                    })
                  }
                />
                <IntervalEditor
                  value={sh.intervals}
                  onChange={(v) =>
                    edit((d) => {
                      d.shifts.find((x) => x.id === sh.id)!.intervals = v;
                    })
                  }
                />
                <details>
                  <summary>
                    {t("Hours exceptions by contract or person")}
                  </summary>
                  <button
                    onClick={() =>
                      edit((d) => {
                        const x = d.shifts.find((x) => x.id === sh.id)!;
                        x.variants ??= [];
                        if (!x.variants.length)
                          x.variants.push({
                            id: id("hours"),
                            label: t("Default hours"),
                            priority: 0,
                            selector: {},
                            scope: {},
                            intervals: structuredClone(x.intervals),
                          });
                        x.variants.push({
                          id: id("hours"),
                          label: t("Hours exception"),
                          priority: 10 + x.variants.length,
                          selector: {},
                          scope: { weekdays: [1, 2, 3, 4] },
                          intervals: structuredClone(x.intervals),
                        });
                      })
                    }
                  >
                    {t("Add hours exception")}
                  </button>
                  {sh.variants?.map((v, i) => (
                    <div key={v.id} className="item-card">
                      <Text
                        label={t("Hours label")}
                        value={v.label}
                        onChange={(x) =>
                          edit((d) => {
                            d.shifts.find((x) => x.id === sh.id)!.variants![
                              i
                            ].label = x;
                          })
                        }
                      />
                      <SimpleSelector
                        s={s}
                        value={v.selector}
                        onChange={(x) =>
                          edit((d) => {
                            d.shifts.find((x) => x.id === sh.id)!.variants![
                              i
                            ].selector = x;
                          })
                        }
                      />
                      <Multi
                        label={t("On weekdays")}
                        values={(v.scope.weekdays ?? [1, 2, 3, 4, 5, 6, 7]).map(
                          String,
                        )}
                        options={daysOfWeek.map((x, i) => ({
                          id: String(i + 1),
                          label: t(x),
                        }))}
                        onChange={(x) =>
                          edit((d) => {
                            d.shifts.find((x) => x.id === sh.id)!.variants![
                              i
                            ].scope.weekdays = x.map(Number);
                          })
                        }
                      />
                      <IntervalEditor
                        value={v.intervals}
                        onChange={(x) =>
                          edit((d) => {
                            d.shifts.find((x) => x.id === sh.id)!.variants![
                              i
                            ].intervals = x;
                          })
                        }
                      />
                    </div>
                  ))}
                </details>
              </article>
            ))}
          <Patterns s={s} edit={edit} review={review} />
          <SimpleTemporal s={s} edit={edit} />
        </section>
      )}
      {step === 3 && <Needs s={s} edit={edit} />}
      {step === 4 && <Distribution s={s} edit={edit} review={review} />}
      {step === 5 && (
        <>
          <CalendarWorkspace
            s={solved?.scenario ?? s}
            r={solved?.result}
            currentScenario={s}
            archive={archives.find((a) => a.id === solved?.archiveId)}
            archives={archives}
            previous={previous}
            stale={stale}
            busy={busy}
            run={run}
            publish={publish}
            simple
            validated={validated}
            onConfigure={() => setStep(0)}
          />
          <details className="saved-calendars">
            <summary>{t("Saved calendars and recovery")}</summary>
            <ScheduleLibrary
              s={s}
              archives={archives}
              activeId={solved?.archiveId}
              run={run}
              comparisonScenarioId={solved?.scenario.id}
              onCompare={compare}
            />
          </details>
        </>
      )}
      {step < 5 && (
        <div className="simple-next">
          <button onClick={() => setStep(Math.min(5, step + 1))}>
            {t("Continue")} →
          </button>
        </div>
      )}
      {restart && (
        <ReviewDialog
          title={t("Start a new scenario")}
          onCancel={() => setRestart(false)}
          onConfirm={() => {
            replace(simpleScenario());
            setStep(0);
            setRestart(false);
          }}
        >
          <p>
            {t(
              "Export your current workspace if needed. Saved calendars remain in the library; the current configuration will be replaced.",
            )}
          </p>
        </ReviewDialog>
      )}
      {pending && (
        <ReviewDialog
          title={t("Review configuration effects")}
          onCancel={() => setPending(undefined)}
          onConfirm={() => {
            replace(pending);
            setPending(undefined);
          }}
        >
          <p>
            {t(
              "The core validated this configuration. Preview the resolved work patterns before applying it; hard rules will also be checked during generation.",
            )}
          </p>
          {preview?.workforce?.employees?.map((e) => (
            <p key={e.employeeId}>
              {s.employees.find((x) => x.id === e.employeeId)?.label ??
                e.employeeId}
              :{" "}
              {s.workPatterns?.find(
                (p) => p.id === e.workPatternAssignment?.workPatternId,
              )?.label ?? t("No individual restriction")}
            </p>
          ))}
        </ReviewDialog>
      )}
    </div>
  );
}
function Absences({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  return (
    <details>
      <summary>{t("Absences and leave")}</summary>
      <button
        onClick={() =>
          edit((d) => {
            d.availability.push({
              id: id("absence"),
              selector: d.employees.length
                ? { employeeIds: [d.employees[0].id] }
                : {},
              scope: { start: d.calendar.start, end: d.calendar.start },
              state: "ABSENT",
            });
          })
        }
      >
        {t("Add absence")}
      </button>
      {s.availability.map((a, i) => (
        <div className="item-card" key={a.id}>
          <SimpleSelector
            s={s}
            value={a.selector}
            onChange={(v) =>
              edit((d) => {
                d.availability[i].selector = v;
              })
            }
          />
          <div className="row">
            <Text
              label={t("Away from")}
              type="date"
              value={a.scope.start ?? s.calendar.start}
              onChange={(v) =>
                edit((d) => {
                  d.availability[i].scope.start = v;
                })
              }
            />
            <Text
              label={t("Through, inclusive")}
              type="date"
              value={a.scope.end ?? s.calendar.end}
              onChange={(v) =>
                edit((d) => {
                  d.availability[i].scope.end = v;
                })
              }
            />
            <button
              onClick={() =>
                edit((d) => {
                  d.availability.splice(i, 1);
                })
              }
            >
              {t("Remove absence")}
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
function Closures({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  return (
    <details>
      <summary>{t("Business closures")}</summary>
      <button
        onClick={() =>
          edit((d) => {
            d.calendar.closures ??= [];
            d.calendar.closures.push({
              id: id("closure"),
              label: t("Business closure"),
              validFrom: d.calendar.start,
              validTo: d.calendar.end,
              selector: {},
              reason: t("Business closure"),
              exceptions: [],
            });
          })
        }
      >
        {t("Add business closure")}
      </button>
      {s.calendar.closures?.map((c, i) => (
        <div className="row" key={c.id}>
          <Text
            label={t("Closure name")}
            value={c.label}
            onChange={(v) =>
              edit((d) => {
                d.calendar.closures![i].label = v;
              })
            }
          />
          <Text
            label={t("Closed from")}
            type="date"
            value={c.validFrom}
            onChange={(v) =>
              edit((d) => {
                d.calendar.closures![i].validFrom = v;
              })
            }
          />
          <Text
            label={t("Reopens on")}
            type="date"
            value={c.validTo ?? ""}
            onChange={(v) =>
              edit((d) => {
                d.calendar.closures![i].validTo = v;
              })
            }
          />
          <button
            onClick={() =>
              edit((d) => {
                d.calendar.closures!.splice(i, 1);
              })
            }
          >
            {t("Remove closure")}
          </button>
        </div>
      ))}
    </details>
  );
}
function SimpleWeeks({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  const [n, setN] = useState(4),
    [special, setSpecial] = useState("");
  return (
    <details>
      <summary>{t("Recurring special weeks and exceptions")}</summary>
      <Select
        label={t("Ordinary week type")}
        value={s.weekConfiguration?.defaultProfileId ?? ""}
        options={s.weekProfiles ?? []}
        onChange={(v) =>
          edit((d) => {
            d.weekConfiguration ??= {
              manual: [],
              recurrences: [],
              frequencies: [],
              history: [],
            };
            d.weekConfiguration.defaultProfileId = v;
          })
        }
      />
      <div className="row">
        <Select
          label={t("Special week type")}
          value={special}
          options={s.weekProfiles ?? []}
          onChange={setSpecial}
        />
        <Text
          label={t("Every N weeks")}
          type="number"
          value={n}
          onChange={(v) => setN(Math.min(104, Math.max(1, Number(v))))}
        />
        <button
          disabled={!special || !s.weekConfiguration?.defaultProfileId}
          onClick={() =>
            edit((d) => {
              const w = d.weekConfiguration!;
              w.recurrences.push({
                id: id("cycle"),
                label: t("Special week cycle"),
                anchor: isoMonday(d.calendar.start),
                validFrom: isoMonday(d.calendar.start),
                sequence: [special, ...Array(n - 1).fill(w.defaultProfileId)],
              });
            })
          }
        >
          {t("Add recurrence from planning start")}
        </button>
      </div>
      <p>
        {t("Existing recurring cycles")}:{" "}
        {s.weekConfiguration?.recurrences.length ?? 0}
      </p>
      <button
        disabled={!special}
        onClick={() =>
          edit((d) => {
            d.weekConfiguration!.manual.push({
              week: isoMonday(d.calendar.start),
              profileId: special,
              overrideRecurrence: true,
              waiveFrequencyIds: [],
              reason: t("Explicit week exception"),
            });
          })
        }
      >
        {t("Add a week exception")}
      </button>
      {s.weekConfiguration?.manual.map((w, i) => (
        <div className="row" key={i}>
          <Text
            label={t("Week beginning")}
            type="date"
            value={w.week}
            onChange={(v) =>
              edit((d) => {
                d.weekConfiguration!.manual[i].week = isoMonday(v);
              })
            }
          />
          <Select
            label={t("Week type")}
            value={w.profileId}
            options={s.weekProfiles ?? []}
            onChange={(v) =>
              edit((d) => {
                d.weekConfiguration!.manual[i].profileId = v;
              })
            }
          />
          <Text
            label={t("Reason")}
            value={w.reason}
            onChange={(v) =>
              edit((d) => {
                d.weekConfiguration!.manual[i].reason = v;
              })
            }
          />
        </div>
      ))}
    </details>
  );
}
function Patterns({
  s,
  edit,
  review,
}: {
  s: Scenario;
  edit: Update;
  review: (s: Scenario) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <>
      <h3>{t("Work patterns")}</h3>
      <p>
        {t(
          "Automatic rules apply to everyone, a role, a contract or one person. A manual individual choice takes precedence. More specific rules have precedence over general rules.",
        )}
      </p>
      <button
        onClick={() =>
          edit((d) => {
            d.workPatterns ??= [];
            d.workPatterns.push({
              id: id("pattern"),
              label: t("New work pattern"),
              versions: [
                {
                  validFrom: d.calendar.start,
                  weekdays: [1, 2, 3, 4, 5],
                  shiftIds: d.shifts.map((s) => s.id),
                  exceptions: [],
                },
              ],
            });
          })
        }
      >
        {t("Add work pattern")}
      </button>
      {s.workPatterns?.map((p, i) => (
        <article className="item-card" key={p.id}>
          <Text
            label={t("Work-pattern name")}
            value={p.label}
            onChange={(v) =>
              edit((d) => {
                d.workPatterns![i].label = v;
              })
            }
          />
          {p.versions.map((v, j) => (
            <details key={j} open={p.versions.length === 1}>
              <summary>
                {t("Effective from {date}", { date: v.validFrom })}
              </summary>
              <Text
                label={t("Effective from")}
                type="date"
                value={v.validFrom}
                onChange={(x) =>
                  edit((d) => {
                    d.workPatterns![i].versions[j].validFrom = x;
                  })
                }
              />
              <Multi
                label={t("Working weekdays")}
                values={v.weekdays.map(String)}
                options={daysOfWeek.map((x, k) => ({
                  id: String(k + 1),
                  label: t(x),
                }))}
                onChange={(x) =>
                  edit((d) => {
                    d.workPatterns![i].versions[j].weekdays = x.map(Number);
                  })
                }
              />
              {v.weekdays.map((day) => (
                <Multi
                  key={day}
                  label={t(daysOfWeek[day - 1]) + ": " + t("Permitted shifts")}
                  values={
                    v.weekdayShifts?.find((x) => x.weekday === day)?.shiftIds ??
                    v.shiftIds
                  }
                  options={s.shifts}
                  onChange={(x) =>
                    edit((d) => {
                      const version = d.workPatterns![i].versions[j];
                      version.weekdayShifts ??= [];
                      version.weekdayShifts = version.weekdayShifts.filter(
                        (x) => x.weekday !== day,
                      );
                      version.weekdayShifts.push({ weekday: day, shiftIds: x });
                    })
                  }
                />
              ))}
            </details>
          ))}
        </article>
      ))}
      <button
        disabled={!s.workPatterns?.length}
        onClick={() =>
          edit((d) => {
            d.workPatternAssignmentRules ??= [];
            d.workPatternAssignmentRules.push({
              id: id("automatic"),
              label: t("Automatic work pattern"),
              enabled: true,
              selector: {},
              workPatternId: d.workPatterns![0].id,
              priority: 0,
              validFrom: d.calendar.start,
            });
          })
        }
      >
        {t("Add automatic work-pattern rule")}
      </button>
      {s.workPatternAssignmentRules?.map((r, i) => (
        <div className="item-card" key={r.id}>
          <SimpleSelector
            s={s}
            value={r.selector}
            onChange={(v) =>
              edit((d) => {
                const rule = d.workPatternAssignmentRules![i];
                rule.selector = v;
                rule.priority = v.employeeIds
                  ? 30
                  : v.where
                    ? 20
                    : v.typeIds
                      ? 10
                      : 0;
              })
            }
          />
          <Select
            label={t("Assign this work pattern")}
            value={r.workPatternId}
            options={s.workPatterns ?? []}
            onChange={(v) =>
              edit((d) => {
                d.workPatternAssignmentRules![i].workPatternId = v;
              })
            }
          />
          <Text
            label={t("Effective from")}
            type="date"
            value={r.validFrom}
            onChange={(v) =>
              edit((d) => {
                d.workPatternAssignmentRules![i].validFrom = v;
              })
            }
          />
          <button
            onClick={() =>
              edit((d) => {
                d.workPatternAssignmentRules!.splice(i, 1);
              })
            }
          >
            {t("Remove rule")}
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          review(structuredClone(s)).catch((e) =>
            notifyError((e as Error).message),
          )
        }
      >
        {t("Preview resolved work patterns")}
      </button>
    </>
  );
}
function Needs({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  const [shift, setShift] = useState(""),
    [profile, setProfile] = useState(
      s.weekConfiguration?.defaultProfileId ?? "",
    ),
    [primary, setPrimary] = useState<Selector>({}),
    [reserve, setReserve] = useState<Selector>({}),
    [fallback, setFallback] = useState(false),
    [count, setCount] = useState(1),
    [presence, setPresence] = useState(false);
  return (
    <section className="panel">
      <h2>{t(questions[3])}</h2>
      <p>
        {t(
          "Exact responsibilities assign only the required number of people. Distinct responsibilities use different people. Presence checks actual coverage throughout the selected hours.",
        )}
      </p>
      <div className="item-card">
        <Select
          label={t("Required duty")}
          value={shift}
          options={s.shifts.filter((x) => x.kind === "WORKING")}
          onChange={setShift}
        />
        <Select
          label={t("During this week type")}
          value={profile}
          options={s.weekProfiles ?? []}
          onChange={setProfile}
        />
        <SimpleSelector
          s={s}
          label="Prefer these people"
          value={primary}
          onChange={setPrimary}
        />
        <label>
          <input
            type="checkbox"
            checked={fallback}
            onChange={(e) => setFallback(e.target.checked)}
          />
          {t("Use substitutes only when needed")}
        </label>
        {fallback && (
          <SimpleSelector
            s={s}
            label="Substitute resources"
            value={reserve}
            onChange={setReserve}
          />
        )}
        <div className="row">
          <Text
            label={t("People required")}
            type="number"
            value={count}
            onChange={(v) => setCount(Math.max(0, Number(v)))}
          />
          <Select
            label={t("Coverage meaning")}
            value={presence ? "PRESENCE" : "RESPONSIBILITY"}
            options={[
              {
                id: "RESPONSIBILITY",
                label: t("Exactly this many people responsible"),
              },
              {
                id: "PRESENCE",
                label: t(
                  "At least this many people present throughout the hours",
                ),
              },
            ]}
            onChange={(v) => setPresence(v === "PRESENCE")}
          />
        </div>
        <button
          disabled={!shift || !profile}
          onClick={() =>
            edit((d) => {
              d.dutyRequirements ??= [];
              const sh = d.shifts.find((x) => x.id === shift)!;
              d.dutyBindingMode = "GLOBAL";
              d.dutyRequirements.push({
                id: "simple:" + id("need"),
                label: sh.label + " · " + t("Required coverage"),
                mode: presence ? "PRESENCE" : "RESPONSIBILITY",
                shiftIds: [shift],
                levels: [
                  { selector: primary, level: 0 },
                  ...(fallback ? [{ selector: reserve, level: 1 }] : []),
                ],
                comparison: presence ? "GE" : "EQ",
                count,
                intervals: structuredClone(
                  sh.intervals.length
                    ? sh.intervals
                    : (sh.variants?.[0]?.intervals ?? []),
                ),
                scope: operationalScope(d, profile),
                preferencePriority: 0,
                exclusiveGroup: "simple:daily-responsibilities",
                bindAssignments: !presence,
              });
            })
          }
        >
          {t("Add coverage requirement")}
        </button>
      </div>
      {s.dutyRequirements?.map((r, i) => (
        <article className="item-card" key={r.id}>
          <h3>{r.label}</h3>
          <p>
            {t(r.mode)} · {t("People required")}: {r.count}
          </p>
          <Text
            label={t("People required")}
            type="number"
            value={r.count}
            onChange={(v) =>
              edit((d) => {
                d.dutyRequirements![i].count = Math.max(0, Number(v));
              })
            }
          />
          <SimpleSelector
            s={s}
            value={r.levels[0].selector}
            onChange={(v) =>
              edit((d) => {
                d.dutyRequirements![i].levels[0].selector = v;
              })
            }
          />
          <IntervalEditor
            value={r.intervals}
            onChange={(v) =>
              edit((d) => {
                d.dutyRequirements![i].intervals = v;
              })
            }
          />
          <Multi
            label={t("On weekdays")}
            values={(r.scope.weekdays ?? [1, 2, 3, 4, 5, 6, 7]).map(String)}
            options={daysOfWeek.map((v, i) => ({
              id: String(i + 1),
              label: t(v),
            }))}
            onChange={(v) =>
              edit((d) => {
                d.dutyRequirements![i].scope.weekdays = v.map(Number);
              })
            }
          />
          <button
            onClick={() =>
              edit((d) => {
                d.dutyRequirements!.splice(i, 1);
              })
            }
          >
            {t("Remove requirement")}
          </button>
        </article>
      ))}
      <NormalRemainder s={s} edit={edit} />
    </section>
  );
}
function NormalRemainder({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  const [normal, setNormal] = useState(
      s.shifts.find((x) => x.kind === "WORKING")?.id ?? "",
    ),
    [who, setWho] = useState<Selector>({}),
    [profile, setProfile] = useState(
      s.weekConfiguration?.defaultProfileId ?? "",
    );
  return (
    <details>
      <summary>{t("What should everyone else work?")}</summary>
      <p>
        {t(
          "Keep normal work available, together with required duties. Allow rest only when a configured succession rule requires it.",
        )}
      </p>
      <SimpleSelector s={s} value={who} onChange={setWho} />
      <Select
        label={t("Normal shift")}
        value={normal}
        options={s.shifts.filter((x) => x.kind === "WORKING")}
        onChange={setNormal}
      />
      <Select
        label={t("Week type")}
        value={profile}
        options={s.weekProfiles ?? []}
        onChange={setProfile}
      />
      <button
        disabled={!normal || !profile}
        onClick={() =>
          edit((d) => {
            const duties = (d.dutyRequirements ?? [])
              .filter((r) => r.scope.weekProfileIds?.includes(profile))
              .flatMap((r) => r.shiftIds);
            d.allowedShifts.push({
              id: "simple:" + id("normal"),
              selector: who,
              scope: operationalScope(d, profile),
              shiftIds: [...new Set([normal, ...duties])],
              allowRequiredRest: true,
            });
          })
        }
      >
        {t("Apply normal-work rule")}
      </button>
      <p>
        {t("Configured normal-work rules")}: {s.allowedShifts.length}
      </p>
    </details>
  );
}
function Distribution({
  s,
  edit,
  review,
}: {
  s: Scenario;
  edit: Update;
  review: (s: Scenario) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]),
    [existingTag, setExistingTag] = useState(""),
    [who, setWho] = useState<Selector>({}),
    [category, setCategory] = useState("Combined burden");
  const [unit, setUnit] = useState<SpacingRule["unit"]>("CALENDAR"),
    [gap, setGap] = useState(2),
    [hard, setHard] = useState(false),
    [normals, setNormals] = useState<string[]>([]),
    [profiles, setProfiles] = useState<string[]>([]);
  return (
    <section className="panel">
      <h2>{t(questions[4])}</h2>
      <Select
        label={t("Reuse an existing burden category")}
        value={existingTag}
        options={[
          { id: "", label: t("Choose duties directly") },
          ...[...new Set(s.shifts.flatMap((x) => x.fairnessTags ?? []))].map(
            (tag) => ({
              id: tag,
              label:
                s.policies.find((p) => p.objective.fairnessTags?.includes(tag))
                  ?.label ?? tag,
            }),
          ),
        ]}
        onChange={(tag) => {
          setExistingTag(tag);
          if (tag)
            setSelected(
              s.shifts
                .filter((x) => x.fairnessTags?.includes(tag))
                .map((x) => x.id),
            );
        }}
      />
      <Multi
        label={t("Treat these duties as one burden category")}
        values={selected}
        options={s.shifts.filter((x) => x.kind === "WORKING")}
        onChange={setSelected}
      />
      <Text
        label={t("Category name")}
        value={category}
        onChange={setCategory}
      />
      <SimpleSelector s={s} value={who} onChange={setWho} />
      <Multi
        label={t("Only in these week types (empty means all)")}
        values={profiles}
        options={s.weekProfiles ?? []}
        onChange={setProfiles}
      />
      <button
        disabled={!selected.length}
        onClick={() =>
          edit((d) => {
            const tag = existingTag || id("burden");
            for (const sh of d.shifts)
              if (selected.includes(sh.id)) {
                sh.fairnessTags ??= [];
                if (!sh.fairnessTags.includes(tag)) sh.fairnessTags.push(tag);
              }
            const p = simplePolicy(category, [], who, 0);
            p.objective.fairnessTags = [tag];
            if (profiles.length)
              p.objective.scope = { weekProfileIds: profiles };
            d.policies.push(p);
          })
        }
      >
        {t("Share the combined burden fairly")}
      </button>
      <p>
        {t(
          "Fair shares use real eligibility on each date. Separate objectives show separate debts and do not add the same duty twice within one category.",
        )}
      </p>
      <div className="item-card">
        <h3>{t("Space duties over time")}</h3>
        <Select
          label={t("Spacing requirement")}
          value={hard ? "HARD" : "SOFT"}
          options={[
            {
              id: "SOFT",
              label: t("Prefer a gap; retain a feasible calendar"),
            },
            {
              id: "HARD",
              label: t(
                "Require a gap; incompatible coverage may be impossible",
              ),
            },
          ]}
          onChange={(v) => setHard(v === "HARD")}
        />
        <Select
          label={t("Measure the gap in")}
          value={unit}
          options={[
            { id: "CALENDAR", label: t("Calendar days between duty dates") },
            {
              id: "NORMAL_WORK_DAYS",
              label: t("Actual normal work assignments between duties"),
            },
          ]}
          onChange={(v) => setUnit(v as SpacingRule["unit"])}
        />
        <Text
          label={t("Desired minimum gap")}
          type="number"
          value={gap}
          onChange={(v) => setGap(Math.min(60, Math.max(1, Number(v))))}
        />
        {unit === "NORMAL_WORK_DAYS" && (
          <Multi
            label={t("These shifts count as normal work")}
            values={normals}
            options={s.shifts.filter(
              (x) => x.kind === "WORKING" && !selected.includes(x.id),
            )}
            onChange={setNormals}
          />
        )}
        <p>
          {t(
            "A calendar gap of 2 forbids consecutive days. A normal-work gap of 1 requires one actual intervening normal assignment. Absence, rest and closure do not count as normal work.",
          )}
        </p>
        <button
          disabled={
            !selected.length || (unit === "NORMAL_WORK_DAYS" && !normals.length)
          }
          onClick={() =>
            edit((d) => {
              d.spacingRules ??= [];
              d.spacingRules.push({
                id: id("spacing"),
                label: category,
                selector: who,
                shiftIds: existingTag ? [] : selected,
                ...(existingTag ? { fairnessTags: [existingTag] } : {}),
                scope: profiles.length ? { weekProfileIds: profiles } : {},
                mode: hard ? "HARD" : "SOFT",
                unit,
                minimumGap: gap,
                normalShiftIds: normals,
                penalty: "GAP_DEFICIT",
                priority: 50,
              });
            })
          }
        >
          {t("Add spacing rule")}
        </button>
      </div>
      <h3>{t("Priority after required coverage and substitutes")}</h3>
      <p>
        {t(
          "Earlier items are optimized first and fixed before later items. Hard rules always apply. Move an item to change the order.",
        )}
      </p>
      {[
        ...s.policies
          .filter((p) => p.active && !p.draft)
          .map((p) => ({
            id: p.id,
            label: p.label,
            priority: p.objective.priority,
            kind: "policy",
          })),
        ...(s.spacingRules ?? [])
          .filter((r) => r.mode === "SOFT")
          .map((r) => ({ ...r, kind: "spacing" })),
      ]
        .sort((a, b) => a.priority - b.priority)
        .map((x, i, all) => (
          <div className="row" key={x.id}>
            <span>
              {i + 1}. {x.label}
            </span>
            <button
              disabled={!i}
              onClick={() =>
                edit((d) => {
                  const order = all.map((x) => x.id);
                  [order[i - 1], order[i]] = [order[i], order[i - 1]];
                  for (const p of d.policies)
                    if (order.includes(p.id))
                      p.objective.priority = order.indexOf(p.id) * 10;
                  for (const r of d.spacingRules ?? [])
                    if (order.includes(r.id))
                      r.priority = order.indexOf(r.id) * 10;
                })
              }
            >
              {t("Move earlier")}
            </button>
          </div>
        ))}
      <button
        disabled={!selected.length}
        onClick={() =>
          edit((d) => {
            const p = simplePolicy(category, selected, who, 20);
            if (profiles.length)
              p.objective.scope = { weekProfileIds: profiles };
            d.policies.push(p);
          })
        }
      >
        {t("Add fairness for the selected duty types")}
      </button>
      {s.spacingRules?.map((r, i) => (
        <div className="row" key={r.id}>
          <span>
            {r.label} · {t(r.mode)} · {r.minimumGap} {t(r.unit)}
          </span>
          <button
            onClick={() =>
              edit((d) => {
                d.spacingRules!.splice(i, 1);
              })
            }
          >
            {t("Remove spacing rule")}
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          review(structuredClone(s)).catch((e) =>
            notifyError((e as Error).message),
          )
        }
      >
        {t("Validate these settings")}
      </button>
    </section>
  );
}
function SimpleTemporal({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [who, setWho] = useState<Selector>({}),
    [meaning, setMeaning] = useState("SUCCESSION");
  return (
    <details>
      <summary>{t("Required rest and next-day rules")}</summary>
      <SimpleSelector s={s} value={who} onChange={setWho} />
      <div className="row">
        <Select
          label={t("After this shift")}
          value={from}
          options={s.shifts}
          onChange={setFrom}
        />
        <Select
          label={t("Next-day rule")}
          value={meaning}
          options={[
            {
              id: "SUCCESSION",
              label: t("Require this shift on the following day"),
            },
            {
              id: "FORBIDDEN_PAIR",
              label: t("Forbid this shift on the following day"),
            },
          ]}
          onChange={setMeaning}
        />
        <Select
          label={t("Following shift")}
          value={to}
          options={s.shifts}
          onChange={setTo}
        />
        <button
          disabled={!from || !to}
          onClick={() =>
            edit((d) => {
              d.temporalRules ??= [];
              d.temporalRules.push({
                id: id("rest"),
                label: t("Next-day rule"),
                type: meaning as "SUCCESSION" | "FORBIDDEN_PAIR",
                selector: who,
                fromShiftIds: [from],
                toShiftIds: [to],
                offsetDays: 1,
                scope: {},
              });
            })
          }
        >
          {t("Add next-day rule")}
        </button>
      </div>
      {s.temporalRules?.map((r, i) => (
        <div className="row" key={r.id}>
          <span>
            {r.label}:{" "}
            {r.fromShiftIds
              .map((id) => s.shifts.find((x) => x.id === id)?.label ?? id)
              .join(", ")}{" "}
            →{" "}
            {r.toShiftIds
              .map((id) => s.shifts.find((x) => x.id === id)?.label ?? id)
              .join(", ")}{" "}
            · {t(r.type)}
          </span>
          <button
            onClick={() =>
              edit((d) => {
                d.temporalRules!.splice(i, 1);
              })
            }
          >
            {t("Remove next-day rule")}
          </button>
        </div>
      ))}
    </details>
  );
}

function Qualifications({ s, edit }: { s: Scenario; edit: Update }) {
  const { t } = useI18n();
  const [name, setName] = useState(""),
    [contract, setContract] = useState("");
  return (
    <details>
      <summary>{t("Contracts and qualifications")}</summary>
      <div className="row">
        <Text label={t("Qualification name")} value={name} onChange={setName} />
        <button
          disabled={!name.trim()}
          onClick={() =>
            edit((d) => {
              d.attributeDefinitions ??= [];
              d.attributeDefinitions.push({
                id: id("qualification"),
                label: name.trim(),
                type: "BOOLEAN",
                default: false,
                visible: true,
              });
              setName("");
            })
          }
        >
          {t("Add qualification")}
        </button>
      </div>
      {(s.attributeDefinitions ?? [])
        .filter((a) => a.type === "ENUM")
        .map((a) => (
          <div className="row" key={a.id}>
            <Text
              label={t("New value for {contract}", { contract: a.label })}
              value={contract}
              onChange={setContract}
            />
            <button
              disabled={!contract.trim() || a.values?.includes(contract.trim())}
              onClick={() =>
                edit((d) => {
                  const attribute = d.attributeDefinitions!.find(
                    (x) => x.id === a.id,
                  )!;
                  attribute.values ??= [];
                  attribute.values.push(contract.trim());
                  setContract("");
                })
              }
            >
              {t("Add contract option")}
            </button>
          </div>
        ))}
    </details>
  );
}
