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
  return (
    <>
      <EntityHeader title="People & groups">
        <span className="badge">{s.employees.length} employees</span>
      </EntityHeader>
      <p className="intro">
        Use stable IDs for references and labels for display. Group membership
        can follow types, explicit people, or attributes.
      </p>
      <section className="panel">
        <h3>Employee types</h3>
        {s.employeeTypes.map((t, i) => (
          <div className="row" key={i}>
            <Text
              label="Type ID"
              value={t.id}
              onChange={(v) =>
                update((d) => {
                  d.employeeTypes[i].id = v;
                })
              }
            />
            <Text
              label="Type label"
              value={t.label}
              onChange={(v) =>
                update((d) => {
                  d.employeeTypes[i].label = v;
                })
              }
            />
            <button
              className="subtle"
              aria-label="Remove type"
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
          label="Add employee type"
          onAdd={() =>
            update((d) => {
              d.employeeTypes.push({ id: id("type"), label: "New type" });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>Employees</h3>
        {s.employees.map((e, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label="Employee ID"
                value={e.id}
                onChange={(v) =>
                  update((d) => {
                    d.employees[i].id = v;
                  })
                }
              />
              <Text
                label="Name / label"
                value={e.label}
                onChange={(v) =>
                  update((d) => {
                    d.employees[i].label = v;
                  })
                }
              />
              <Select
                label="Main type"
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
                Remove employee
              </button>
            </div>
            <details>
              <summary>Attributes</summary>
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
          label="Add employee"
          onAdd={() =>
            update((d) => {
              d.employees.push({
                id: id("employee"),
                label: "New employee",
                typeId: d.employeeTypes[0]?.id || "",
                attributes: {},
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>Groups</h3>
        {s.groups.map((g, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label="Group ID"
                value={g.id}
                onChange={(v) =>
                  update((d) => {
                    d.groups[i].id = v;
                  })
                }
              />
              <Text
                label="Group label"
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
                Remove group
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
          label="Add group"
          onAdd={() =>
            update((d) => {
              d.groups.push({
                id: id("group"),
                label: "New group",
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
  return (
    <>
      <EntityHeader title="Shift types" />
      <p className="intro">
        Intervals use local wall-clock time. Add as many disjoint intervals as
        needed. Overnight work uses an explicit next-day end.
      </p>
      {s.shifts.map((sh, i) => (
        <section className="panel" key={i}>
          <div className="row">
            <Text
              label="Shift ID"
              value={sh.id}
              onChange={(v) =>
                update((d) => {
                  d.shifts[i].id = v;
                })
              }
            />
            <Text
              label="Shift label"
              value={sh.label}
              onChange={(v) =>
                update((d) => {
                  d.shifts[i].label = v;
                })
              }
            />
            <Select
              label="Structural type"
              value={sh.kind}
              options={[
                { id: "WORKING", label: "Working" },
                { id: "OFF", label: "Scheduled rest" },
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
              Remove shift
            </button>
          </div>
          {sh.intervals.map((interval, j) => (
            <div className="row interval" key={j}>
              <span className="muted">Interval {j + 1}</span>
              <Text
                label="Start"
                type="time"
                value={interval.start}
                onChange={(v) =>
                  update((d) => {
                    d.shifts[i].intervals[j].start = v;
                  })
                }
              />
              <Text
                label="End"
                type="time"
                value={interval.end}
                onChange={(v) =>
                  update((d) => {
                    d.shifts[i].intervals[j].end = v;
                  })
                }
              />
              <Select
                label="End date"
                value={String(interval.endDayOffset)}
                options={[
                  { id: "0", label: "Same day" },
                  { id: "1", label: "Next day" },
                ]}
                onChange={(v) =>
                  update((d) => {
                    d.shifts[i].intervals[j].endDayOffset = Number(v);
                  })
                }
              />
              <button
                className="subtle"
                aria-label="Remove interval"
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
              label="Add time interval"
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
        label="Add shift type"
        onAdd={() =>
          update((d) => {
            d.shifts.push({
              id: id("shift"),
              label: "New shift",
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
  return (
    <>
      <EntityHeader title="Calendar & availability" />
      <p className="intro">
        An excluded day has no assignments. An absent person has no assignment.
        Scheduled rest remains an explicit permitted shift.
      </p>
      <section className="panel">
        <h3>Planning window</h3>
        <div className="row">
          <Text
            label="First date"
            type="date"
            value={s.calendar.start}
            onChange={(v) =>
              update((d) => {
                d.calendar.start = v;
              })
            }
          />
          <Text
            label="Last date"
            type="date"
            value={s.calendar.end}
            onChange={(v) =>
              update((d) => {
                d.calendar.end = v;
              })
            }
          />
          <Text
            label="Timezone"
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
            label="Globally excluded dates"
            value={s.calendar.excludedDates}
            onChange={(v) =>
              update((d) => {
                d.calendar.excludedDates = v;
              })
            }
          />
          <DateList
            label="Excluded ISO weeks (YYYY-Www)"
            type="week"
            value={s.calendar.excludedIsoWeeks}
            onChange={(v) =>
              update((d) => {
                d.calendar.excludedIsoWeeks = v;
              })
            }
          />
        </div>
        <h4>Excluded date ranges</h4>
        {s.calendar.excludedRanges.map((r, i) => (
          <div className="row" key={i}>
            <Text
              label="Range start"
              type="date"
              value={r.start}
              onChange={(v) =>
                update((d) => {
                  d.calendar.excludedRanges[i].start = v;
                })
              }
            />
            <Text
              label="Range end"
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
              aria-label="Remove excluded range"
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
          label="Add excluded range"
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
        <h3>Individual unavailability</h3>
        {s.availability.map((a, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label="Absence ID"
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
                Remove absence
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
          label="Add absence"
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
        <h3>Allowed shift restrictions</h3>
        <p className="hint">
          Every applicable restriction intersects with the others. An empty
          intersection is infeasible; rest is never inserted automatically.
        </p>
        {s.allowedShifts.map((a, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label="Restriction ID"
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
                Remove restriction
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
              label="Permitted shifts"
              values={a.shiftIds}
              options={s.shifts}
              onChange={(v) =>
                update((d) => {
                  d.allowedShifts[i].shiftIds = v;
                })
              }
            />
            <ScopeEditor
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
          label="Add allowed-shift rule"
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
