import { useI18n } from "./i18n";
import { type Scenario, id } from "./model";
import {
  Text,
  Select,
  Multi,
  SelectorEditor,
  ScopeEditor,
  AttributeEditor,
  DateList,
  AddRow,
  EntityHeader,
} from "./editors";
export type Update = (fn: (s: Scenario) => void) => void;
export function People({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  return (
    <>
      <EntityHeader title={t("People & groups")}>
        <span className="badge">
          {t("{count} employees", { count: s.employees.length })}
        </span>
      </EntityHeader>
      <p className="intro">
        {t(
          "Use stable IDs for references and labels for display. Group membership can follow types, explicit people, or attributes.",
        )}{" "}
      </p>
      <section className="panel">
        <h3>{t("Employee types")}</h3>
        {s.employeeTypes.map((employeeType, i) => (
          <div className="row" key={i}>
            <Text
              label={t("Type ID")}
              value={employeeType.id}
              onChange={(v) =>
                update((d) => {
                  d.employeeTypes[i].id = v;
                })
              }
            />
            <Text
              label={t("Type label")}
              value={employeeType.label}
              onChange={(v) =>
                update((d) => {
                  d.employeeTypes[i].label = v;
                })
              }
            />
            <button
              className="subtle"
              aria-label={t("Remove type")}
              onClick={() =>
                update((d) => {
                  d.employeeTypes.splice(i, 1);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <AddRow
          label={t("Add employee type")}
          onAdd={() =>
            update((d) => {
              d.employeeTypes.push({ id: id("type"), label: t("New type") });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Employees")}</h3>
        {s.employees.map((e, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label={t("Employee ID")}
                value={e.id}
                onChange={(v) =>
                  update((d) => {
                    d.employees[i].id = v;
                  })
                }
              />
              <Text
                label={t("Name / label")}
                value={e.label}
                onChange={(v) =>
                  update((d) => {
                    d.employees[i].label = v;
                  })
                }
              />
              <Select
                label={t("Main type")}
                value={e.typeId}
                options={s.employeeTypes}
                onChange={(v) =>
                  update((d) => {
                    d.employees[i].typeId = v;
                  })
                }
              />
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.employees.splice(i, 1);
                  })
                }
              >
                {t("Remove employee")}{" "}
              </button>
            </div>
            <details>
              <summary>{t("Attributes")}</summary>
              <AttributeEditor
                value={e.attributes}
                onChange={(v) =>
                  update((d) => {
                    d.employees[i].attributes = v;
                  })
                }
              />
            </details>
          </article>
        ))}
        <AddRow
          label={t("Add employee")}
          onAdd={() =>
            update((d) => {
              d.employees.push({
                id: id("employee"),
                label: t("New employee"),
                typeId: d.employeeTypes[0]?.id || "",
                attributes: {},
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Groups")}</h3>
        {s.groups.map((g, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label={t("Group ID")}
                value={g.id}
                onChange={(v) =>
                  update((d) => {
                    d.groups[i].id = v;
                  })
                }
              />
              <Text
                label={t("Group label")}
                value={g.label}
                onChange={(v) =>
                  update((d) => {
                    d.groups[i].label = v;
                  })
                }
              />
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.groups.splice(i, 1);
                  })
                }
              >
                {t("Remove group")}{" "}
              </button>
            </div>
            <SelectorEditor
              s={s}
              value={g.selector}
              excludeGroup={g.id}
              onChange={(v) =>
                update((d) => {
                  d.groups[i].selector = v;
                })
              }
            />
          </article>
        ))}
        <AddRow
          label={t("Add group")}
          onAdd={() =>
            update((d) => {
              d.groups.push({
                id: id("group"),
                label: t("New group"),
                selector: {},
              });
            })
          }
        />
      </section>
    </>
  );
}
export function Shifts({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  return (
    <>
      <EntityHeader title={t("Shift types")} />
      <p className="intro">
        {t(
          "Intervals use local wall-clock time. Add as many disjoint intervals as needed. Overnight work uses an explicit next-day end.",
        )}{" "}
      </p>
      {s.shifts.map((sh, i) => (
        <section className="panel" key={i}>
          <div className="row">
            <Text
              label={t("Shift ID")}
              value={sh.id}
              onChange={(v) =>
                update((d) => {
                  d.shifts[i].id = v;
                })
              }
            />
            <Text
              label={t("Shift label")}
              value={sh.label}
              onChange={(v) =>
                update((d) => {
                  d.shifts[i].label = v;
                })
              }
            />
            <Select
              label={t("Structural type")}
              value={sh.kind}
              options={[
                { id: "WORKING", label: t("Working") },
                { id: "OFF", label: t("Scheduled rest") },
              ]}
              onChange={(v) =>
                update((d) => {
                  d.shifts[i].kind = v as "WORKING" | "OFF";
                  d.shifts[i].intervals =
                    v === "OFF"
                      ? []
                      : [{ start: "09:00", end: "17:00", endDayOffset: 0 }];
                })
              }
            />
            <button
              className="danger"
              onClick={() =>
                update((d) => {
                  d.shifts.splice(i, 1);
                })
              }
            >
              {t("Remove shift")}{" "}
            </button>
          </div>
          {sh.intervals.map((interval, j) => (
            <div className="row interval" key={j}>
              <span className="muted">
                {t("Interval {number}", { number: j + 1 })}
              </span>
              <Text
                label={t("Start")}
                type="time"
                value={interval.start}
                onChange={(v) =>
                  update((d) => {
                    d.shifts[i].intervals[j].start = v;
                  })
                }
              />
              <Text
                label={t("End")}
                type="time"
                value={interval.end}
                onChange={(v) =>
                  update((d) => {
                    d.shifts[i].intervals[j].end = v;
                  })
                }
              />
              <Select
                label={t("End date")}
                value={String(interval.endDayOffset)}
                options={[
                  { id: "0", label: t("Same day") },
                  { id: "1", label: t("Next day") },
                ]}
                onChange={(v) =>
                  update((d) => {
                    d.shifts[i].intervals[j].endDayOffset = Number(v);
                  })
                }
              />
              <button
                className="subtle"
                aria-label={t("Remove interval")}
                onClick={() =>
                  update((d) => {
                    d.shifts[i].intervals.splice(j, 1);
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          {sh.kind === "WORKING" && (
            <AddRow
              label={t("Add time interval")}
              onAdd={() =>
                update((d) => {
                  d.shifts[i].intervals.push({
                    start: "09:00",
                    end: "17:00",
                    endDayOffset: 0,
                  });
                })
              }
            />
          )}
        </section>
      ))}
      <AddRow
        label={t("Add shift type")}
        onAdd={() =>
          update((d) => {
            d.shifts.push({
              id: id("shift"),
              label: t("New shift"),
              kind: "WORKING",
              intervals: [{ start: "09:00", end: "17:00", endDayOffset: 0 }],
            });
          })
        }
      />
    </>
  );
}
export function Calendar({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  return (
    <>
      <EntityHeader title={t("Calendar & availability")} />
      <p className="intro">
        {t(
          "An excluded day has no assignments. An absent person has no assignment. Scheduled rest remains an explicit permitted shift.",
        )}{" "}
      </p>
      <section className="panel">
        <h3>{t("Planning window")}</h3>
        <div className="row">
          <Text
            label={t("First date")}
            type="date"
            value={s.calendar.start}
            onChange={(v) =>
              update((d) => {
                d.calendar.start = v;
              })
            }
          />
          <Text
            label={t("Last date")}
            type="date"
            value={s.calendar.end}
            onChange={(v) =>
              update((d) => {
                d.calendar.end = v;
              })
            }
          />
          <Text
            label={t("Timezone")}
            value={s.calendar.timezone}
            onChange={(v) =>
              update((d) => {
                d.calendar.timezone = v;
              })
            }
          />
        </div>
        <div className="two-columns">
          <DateList
            label={t("Globally excluded dates")}
            value={s.calendar.excludedDates}
            onChange={(v) =>
              update((d) => {
                d.calendar.excludedDates = v;
              })
            }
          />
          <DateList
            label={t("Excluded ISO weeks (YYYY-Www)")}
            type="week"
            value={s.calendar.excludedIsoWeeks}
            onChange={(v) =>
              update((d) => {
                d.calendar.excludedIsoWeeks = v;
              })
            }
          />
        </div>
        <h4>{t("Excluded date ranges")}</h4>
        {s.calendar.excludedRanges.map((r, i) => (
          <div className="row" key={i}>
            <Text
              label={t("Range start")}
              type="date"
              value={r.start}
              onChange={(v) =>
                update((d) => {
                  d.calendar.excludedRanges[i].start = v;
                })
              }
            />
            <Text
              label={t("Range end")}
              type="date"
              value={r.end}
              onChange={(v) =>
                update((d) => {
                  d.calendar.excludedRanges[i].end = v;
                })
              }
            />
            <button
              className="subtle"
              aria-label={t("Remove excluded range")}
              onClick={() =>
                update((d) => {
                  d.calendar.excludedRanges.splice(i, 1);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <AddRow
          label={t("Add excluded range")}
          onAdd={() =>
            update((d) => {
              d.calendar.excludedRanges.push({
                start: d.calendar.start,
                end: d.calendar.start,
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Individual unavailability")}</h3>
        {s.availability.map((a, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label={t("Absence ID")}
                value={a.id}
                onChange={(v) =>
                  update((d) => {
                    d.availability[i].id = v;
                  })
                }
              />
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.availability.splice(i, 1);
                  })
                }
              >
                {t("Remove absence")}{" "}
              </button>
            </div>
            <SelectorEditor
              s={s}
              value={a.selector}
              onChange={(v) =>
                update((d) => {
                  d.availability[i].selector = v;
                })
              }
            />
            <ScopeEditor
              s={s}
              value={a.scope}
              onChange={(v) =>
                update((d) => {
                  d.availability[i].scope = v;
                })
              }
            />
          </article>
        ))}
        <AddRow
          label={t("Add absence")}
          onAdd={() =>
            update((d) => {
              d.availability.push({
                id: id("absence"),
                selector: {
                  employeeIds: d.employees[0] ? [d.employees[0].id] : [],
                },
                scope: { start: d.calendar.start, end: d.calendar.start },
                state: "ABSENT",
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Allowed shift restrictions")}</h3>
        <p className="hint">
          {t(
            "Every applicable restriction intersects with the others. An empty intersection is infeasible; rest is never inserted automatically.",
          )}{" "}
        </p>
        {s.allowedShifts.map((a, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label={t("Restriction ID")}
                value={a.id}
                onChange={(v) =>
                  update((d) => {
                    d.allowedShifts[i].id = v;
                  })
                }
              />
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.allowedShifts.splice(i, 1);
                  })
                }
              >
                {t("Remove restriction")}{" "}
              </button>
            </div>
            <SelectorEditor
              s={s}
              value={a.selector}
              onChange={(v) =>
                update((d) => {
                  d.allowedShifts[i].selector = v;
                })
              }
            />
            <Multi
              label={t("Permitted shifts")}
              values={a.shiftIds}
              options={s.shifts}
              onChange={(v) =>
                update((d) => {
                  d.allowedShifts[i].shiftIds = v;
                })
              }
            />
            <ScopeEditor
              s={s}
              value={a.scope}
              onChange={(v) =>
                update((d) => {
                  d.allowedShifts[i].scope = v;
                })
              }
            />
          </article>
        ))}
        <AddRow
          label={t("Add allowed-shift rule")}
          onAdd={() =>
            update((d) => {
              d.allowedShifts.push({
                id: id("allowed"),
                selector: {},
                scope: {},
                shiftIds: d.shifts.map((sh) => sh.id),
              });
            })
          }
        />
      </section>
    </>
  );
}
