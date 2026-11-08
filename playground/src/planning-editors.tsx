import { useState, useEffect } from "react";
import { type Scenario, type Result, id } from "./model";
import {
  initializeEvolution,
  isoMonday,
  type Frequency,
  type WeekProfile,
} from "./evolution-model";
import { type Update } from "./setup";
import {
  Text,
  Select,
  Multi,
  SelectorEditor,
  ScopeEditor,
  EntityHeader,
  AddRow,
} from "./editors";
import { IntervalEditor } from "./evolution";
import { useI18n } from "./i18n";
import { coreAction } from "./api";
function OptionalNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="optional-number">
      <label>
        <input
          type="checkbox"
          checked={value !== undefined}
          onChange={(e) => onChange(e.target.checked ? 1 : undefined)}
        />
        {label}
      </label>
      {value !== undefined && (
        <input
          aria-label={label}
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}
export function WeekPlanner({ s, update }: { s: Scenario; update: Update }) {
  const { t, diagnostic, localizeError } = useI18n();
  const [preview, setPreview] = useState<Result>(),
    [error, setError] = useState(""),
    [nextProfile, setNextProfile] = useState("");
  const config = s.weekConfiguration ?? {
      manual: [],
      recurrences: [],
      frequencies: [],
      history: [],
    },
    profiles = s.weekProfiles || [];
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      coreAction("inspect", s, {}, { silent: true })
        .then((r) => {
          if (current) {
            setPreview(r);
            setError("");
          }
        })
        .catch((e) => {
          if (current) setError((e as Error).message);
        });
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [s]);
  const createProfile = () =>
    update((d) => {
      initializeEvolution(d);
      const p: WeekProfile = {
        id: id("profile"),
        label: t("New week profile"),
        offWeekdays: [],
        holidayMode: "NORMAL",
        constraintIds: [],
        policyIds: [],
      };
      d.weekProfiles!.push(p);
      if (!d.weekConfiguration!.defaultProfileId)
        d.weekConfiguration!.defaultProfileId = p.id;
      setNextProfile(p.id);
    });
  return (
    <>
      <EntityHeader title={t("Week profiles & recurrence")}>
        <button onClick={createProfile}>{t("Create week profile")}</button>
      </EntityHeader>
      <p className="intro">
        {t(
          "One main profile per ISO week. Manual exceptions do not shift the recurrence. Free weeks can be selected jointly by CP-SAT.",
        )}
      </p>
      {profiles.map((p, i) => (
        <section className="panel" key={p.id}>
          <div className="row">
            <Text
              label={t("Profile label")}
              value={p.label}
              onChange={(x) =>
                update((d) => {
                  d.weekProfiles![i].label = x;
                })
              }
            />
            <Select
              label={t("National holiday operation")}
              value={p.holidayMode}
              options={[
                { id: "NORMAL", label: t("Work can be scheduled") },
                { id: "OFF", label: t("Scheduled rest only") },
              ]}
              onChange={(x) =>
                update((d) => {
                  d.weekProfiles![i].holidayMode = x as "NORMAL" | "OFF";
                })
              }
            />
            <button
              onClick={() =>
                update((d) => {
                  d.weekProfiles!.push({
                    ...structuredClone(p),
                    id: id("profile"),
                    label: p.label + " " + t("Copy"),
                  });
                })
              }
            >
              {t("Duplicate")}
            </button>
            <button
              className="danger"
              onClick={() =>
                update((d) => {
                  d.weekProfiles!.splice(i, 1);
                })
              }
            >
              {t("Remove profile")}
            </button>
          </div>
          <Multi
            label={t("Ordinary rest weekdays")}
            values={p.offWeekdays.map(String)}
            options={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
              (label, i) => ({ id: String(i + 1), label: t(label) }),
            )}
            onChange={(x) =>
              update((d) => {
                d.weekProfiles![i].offWeekdays = x.map(Number);
              })
            }
          />
          <details>
            <summary>{t("Profile references")}</summary>
            <Multi
              label={t("Permitted shifts (empty field means unrestricted)")}
              options={s.shifts}
              values={p.shiftIds || []}
              onChange={(x) =>
                update((d) => {
                  if (x.length) d.weekProfiles![i].shiftIds = x;
                  else delete d.weekProfiles![i].shiftIds;
                })
              }
            />
            <Multi
              label={t("Shared rules")}
              options={s.constraints.map((c) => ({
                id: c.id,
                label: c.label || c.id,
              }))}
              values={p.constraintIds}
              onChange={(x) =>
                update((d) => {
                  d.weekProfiles![i].constraintIds = x;
                })
              }
            />
            <Multi
              label={t("Policies active in this profile")}
              options={s.policies}
              values={p.policyIds}
              onChange={(x) =>
                update((d) => {
                  d.weekProfiles![i].policyIds = x;
                })
              }
            />
            <Text
              label={t("Profile ID")}
              value={p.id}
              onChange={(x) =>
                update((d) => {
                  d.weekProfiles![i].id = x;
                })
              }
            />
          </details>
        </section>
      ))}
      <section className="panel">
        <h3>{t("Deterministic classification")}</h3>
        <Select
          createKind="profile"
          label={t("Default profile")}
          value={config.defaultProfileId || ""}
          options={[{ id: "", label: t("No default") }, ...profiles]}
          onChange={(x) =>
            update((d) => {
              initializeEvolution(d);
              if (x) d.weekConfiguration!.defaultProfileId = x;
              else delete d.weekConfiguration!.defaultProfileId;
            })
          }
        />
        {config.recurrences.map((r, i) => (
          <article className="item-card" key={r.id}>
            <div className="row">
              <Text
                label={t("Recurrence label")}
                value={r.label}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.recurrences[i].label = x;
                  })
                }
              />
              <Text
                label={t("Anchor date (normalized to ISO Monday)")}
                type="date"
                value={r.anchor}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.recurrences[i].anchor = x;
                  })
                }
              />
              <Text
                label={t("Effective Monday")}
                type="date"
                value={r.validFrom}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.recurrences[i].validFrom =
                      isoMonday(x);
                  })
                }
              />
              <Text
                label={t("Until Monday (exclusive)")}
                type="date"
                value={r.validTo || ""}
                onChange={(x) =>
                  update((d) => {
                    if (x)
                      d.weekConfiguration!.recurrences[i].validTo =
                        isoMonday(x);
                    else delete d.weekConfiguration!.recurrences[i].validTo;
                  })
                }
              />
              <button
                onClick={() =>
                  update((d) => {
                    d.weekConfiguration!.recurrences.splice(i, 1);
                  })
                }
              >
                {t("Remove recurrence")}
              </button>
            </div>
            <h4>{t("Repeating week sequence")}</h4>
            <div className="cycle-chips">
              {r.sequence.map((p, j) => (
                <span className="chip" key={j}>
                  {j + 1}. {profiles.find((x) => x.id === p)?.label || p}
                  <button
                    aria-label={t("Move profile earlier")}
                    disabled={j === 0}
                    onClick={() =>
                      update((d) => {
                        const list =
                          d.weekConfiguration!.recurrences[i].sequence;
                        [list[j - 1], list[j]] = [list[j], list[j - 1]];
                      })
                    }
                  >
                    ←
                  </button>
                  <button
                    aria-label={t("Remove profile from cycle")}
                    onClick={() =>
                      update((d) => {
                        d.weekConfiguration!.recurrences[i].sequence.splice(
                          j,
                          1,
                        );
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="row">
              <Select
                label={t("Next profile in cycle")}
                value={nextProfile || profiles[0]?.id || ""}
                options={profiles}
                onChange={setNextProfile}
              />
              <button
                disabled={!profiles.length}
                onClick={() =>
                  update((d) => {
                    d.weekConfiguration!.recurrences[i].sequence.push(
                      nextProfile || profiles[0].id,
                    );
                  })
                }
              >
                {t("Append profile")}
              </button>
            </div>
          </article>
        ))}
        <AddRow
          label={t("Create recurrence version")}
          onAdd={() =>
            update((d) => {
              initializeEvolution(d);
              d.weekConfiguration!.recurrences.push({
                id: id("cycle"),
                label: t("New recurrence"),
                anchor: d.calendar.start,
                validFrom: isoMonday(d.calendar.start),
                sequence: profiles[0] ? [profiles[0].id] : [],
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Solver-selected free weeks")}</h3>
        <label>
          <input
            type="checkbox"
            checked={!!config.automatic}
            onChange={(e) =>
              update((d) => {
                initializeEvolution(d);
                if (e.target.checked)
                  d.weekConfiguration!.automatic = {
                    validFrom: isoMonday(d.calendar.start),
                    profileIds: profiles.map((p) => p.id),
                  };
                else delete d.weekConfiguration!.automatic;
              })
            }
          />
          {t("Enable automatic profile selection")}
        </label>
        {config.automatic && (
          <>
            <div className="row">
              <Text
                label={t("Effective Monday")}
                type="date"
                value={config.automatic.validFrom}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.automatic!.validFrom = isoMonday(x);
                  })
                }
              />
              <Text
                label={t("Until Monday (exclusive)")}
                type="date"
                value={config.automatic.validTo || ""}
                onChange={(x) =>
                  update((d) => {
                    if (x)
                      d.weekConfiguration!.automatic!.validTo = isoMonday(x);
                    else delete d.weekConfiguration!.automatic!.validTo;
                  })
                }
              />
            </div>
            <Multi
              label={t("Selectable profiles")}
              options={profiles}
              values={config.automatic.profileIds}
              onChange={(x) =>
                update((d) => {
                  d.weekConfiguration!.automatic!.profileIds = x;
                })
              }
            />
          </>
        )}
        <h4>{t("Hard and desired frequencies")}</h4>
        {config.frequencies.map((f, i) => (
          <article className="item-card" key={f.id}>
            <Select
              createKind="profile"
              label={t("Profile")}
              options={profiles}
              value={f.profileId}
              onChange={(x) =>
                update((d) => {
                  d.weekConfiguration!.frequencies[i].profileId = x;
                })
              }
            />
            <div className="two-columns">
              {(
                [
                  ["minGapWeeks", "Minimum gap in weeks (hard)"],
                  ["maxGapWeeks", "Maximum gap in weeks (hard)"],
                  ["windowWeeks", "Rolling window length"],
                  ["minCount", "Minimum count in window (hard)"],
                  ["maxCount", "Maximum count in window (hard)"],
                  ["desiredCount", "Desired count in window (soft)"],
                  ["desiredGapWeeks", "Desired gap in weeks (soft)"],
                ] as const
              ).map(([key, label]) => (
                <OptionalNumber
                  key={key}
                  label={t(label)}
                  value={f[key]}
                  onChange={(x) =>
                    update((d) => {
                      if (x === undefined)
                        delete d.weekConfiguration!.frequencies[i][key];
                      else d.weekConfiguration!.frequencies[i][key] = x;
                    })
                  }
                />
              ))}
            </div>
            <button
              className="danger"
              onClick={() =>
                update((d) => {
                  d.weekConfiguration!.frequencies.splice(i, 1);
                })
              }
            >
              {t("Remove frequency rule")}
            </button>
          </article>
        ))}
        <AddRow
          label={t("Add frequency rule")}
          onAdd={() =>
            update((d) => {
              initializeEvolution(d);
              d.weekConfiguration!.frequencies.push({
                id: id("frequency"),
                profileId: profiles[0]?.id || "",
                windowWeeks: 4,
                minCount: 1,
                maxCount: 1,
                desiredCount: 1,
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Manual week exceptions")}</h3>
        <p className="hint">
          {t(
            "Overrides require a reason. Frequency waivers affect only the explicitly selected hard rules.",
          )}
        </p>
        {config.manual.map((m, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label={t("Week containing date")}
                type="date"
                value={m.week}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.manual[i].week = isoMonday(x);
                  })
                }
              />
              <Select
                createKind="profile"
                label={t("Profile")}
                value={m.profileId}
                options={profiles}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.manual[i].profileId = x;
                  })
                }
              />
              <Text
                label={t("Reason")}
                value={m.reason}
                onChange={(x) =>
                  update((d) => {
                    d.weekConfiguration!.manual[i].reason = x;
                  })
                }
              />
              <button
                onClick={() =>
                  update((d) => {
                    d.weekConfiguration!.manual.splice(i, 1);
                  })
                }
              >
                {t("Restore derived profile")}
              </button>
            </div>
            <label>
              <input
                type="checkbox"
                checked={m.overrideRecurrence}
                onChange={(e) =>
                  update((d) => {
                    d.weekConfiguration!.manual[i].overrideRecurrence =
                      e.target.checked;
                  })
                }
              />
              {t("Authorize recurrence exception")}
            </label>
            <Multi
              label={t("Explicit hard-frequency waivers")}
              options={config.frequencies.map((f) => ({
                id: f.id,
                label: f.id,
              }))}
              values={m.waiveFrequencyIds}
              onChange={(x) =>
                update((d) => {
                  d.weekConfiguration!.manual[i].waiveFrequencyIds = x;
                })
              }
            />
          </article>
        ))}
        <AddRow
          label={t("Add manual week override")}
          onAdd={() =>
            update((d) => {
              initializeEvolution(d);
              d.weekConfiguration!.manual.push({
                week: isoMonday(d.calendar.start),
                profileId: profiles[0]?.id || "",
                overrideRecurrence: false,
                waiveFrequencyIds: [],
                reason: "",
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Weekly calendar preview")}</h3>
        <button
          onClick={async () => {
            try {
              setPreview(await coreAction("inspect", s));
              setError("");
            } catch (e) {
              setError(localizeError((e as Error).message));
            }
          }}
        >
          {t("Preview weekly classification")}
        </button>
        {error && <p className="error">{error}</p>}
        {preview?.diagnostics.map((d, i) => (
          <p className="error" key={i}>
            {diagnostic(d)}
          </p>
        ))}
        <div className="week-preview">
          {preview?.weekAssignments?.map((w) => (
            <article className="item-card" key={w.week}>
              <strong>
                {w.week} · {w.isoWeek}
              </strong>
              <p>
                {t(w.origin)} ·{" "}
                {(w.profileIds || [w.profileId || ""])
                  .map((id) => profiles.find((p) => p.id === id)?.label || id)
                  .join(" / ")}
              </p>
              <Select
                label={t("Override this week")}
                options={[
                  { id: "", label: t("Keep derived classification") },
                  ...profiles,
                ]}
                value={
                  config.manual.find((m) => isoMonday(m.week) === w.week)
                    ?.profileId || ""
                }
                onChange={(x) =>
                  update((d) => {
                    initializeEvolution(d);
                    d.weekConfiguration!.manual =
                      d.weekConfiguration!.manual.filter(
                        (m) => isoMonday(m.week) !== w.week,
                      );
                    if (x)
                      d.weekConfiguration!.manual.push({
                        week: w.week,
                        profileId: x,
                        overrideRecurrence: false,
                        reason: "",
                        waiveFrequencyIds: [],
                      });
                  })
                }
              />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
export function HolidayClosures({
  s,
  update,
}: {
  s: Scenario;
  update: Update;
}) {
  const { t } = useI18n();
  return (
    <section className="panel">
      <h3>{t("Holidays and company closures")}</h3>
      <p className="hint">
        {t(
          "A holiday annotation is separate from a profile rest rule, a company closure and individual leave. Closure end dates are exclusive.",
        )}
      </p>
      <label>
        <input
          type="checkbox"
          checked={!!s.calendar.holidays}
          onChange={(e) =>
            update((d) => {
              initializeEvolution(d);
              if (e.target.checked)
                d.calendar.holidays = {
                  country: "IT",
                  catalogueVersion: "IT-2001-2026.1",
                  localDates: [],
                };
              else delete d.calendar.holidays;
            })
          }
        />
        {t("Use the versioned Italian national holiday catalogue")}
      </label>
      {s.calendar.holidays && (
        <>
          <p className="hint">
            {t(
              "Includes Easter Monday and 4 October from 2026. Supported years: 2001–2200.",
            )}
          </p>
          {s.calendar.holidays.localDates.map((x, i) => (
            <div className="row" key={i}>
              <Text
                label={t("Local holiday date")}
                type="date"
                value={x.date}
                onChange={(v) =>
                  update((d) => {
                    d.calendar.holidays!.localDates[i].date = v;
                  })
                }
              />
              <Text
                label={t("Holiday label")}
                value={x.label}
                onChange={(v) =>
                  update((d) => {
                    d.calendar.holidays!.localDates[i].label = v;
                  })
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={x.holiday}
                  onChange={(e) =>
                    update((d) => {
                      d.calendar.holidays!.localDates[i].holiday =
                        e.target.checked;
                    })
                  }
                />
                {t("Holiday")}
              </label>
              <button
                onClick={() =>
                  update((d) => {
                    d.calendar.holidays!.localDates.splice(i, 1);
                  })
                }
              >
                {t("Remove")}
              </button>
            </div>
          ))}
          <AddRow
            label={t("Add local holiday or exception")}
            onAdd={() =>
              update((d) => {
                d.calendar.holidays!.localDates.push({
                  date: d.calendar.start,
                  label: t("Local holiday"),
                  holiday: true,
                });
              })
            }
          />
        </>
      )}
      {(s.calendar.closures || []).map((c, i) => (
        <article className="item-card" key={c.id}>
          <div className="row">
            <Text
              label={t("Closure label")}
              value={c.label}
              onChange={(x) =>
                update((d) => {
                  d.calendar.closures![i].label = x;
                })
              }
            />
            <Text
              label={t("Closed from")}
              type="date"
              value={c.validFrom}
              onChange={(x) =>
                update((d) => {
                  d.calendar.closures![i].validFrom = x;
                })
              }
            />
            <Text
              label={t("Closed until (exclusive)")}
              type="date"
              value={c.validTo || ""}
              onChange={(x) =>
                update((d) => {
                  d.calendar.closures![i].validTo = x;
                })
              }
            />
            <button
              className="danger"
              onClick={() =>
                update((d) => {
                  d.calendar.closures!.splice(i, 1);
                })
              }
            >
              {t("Remove closure")}
            </button>
          </div>
          <Text
            label={t("Reason")}
            value={c.reason}
            onChange={(x) =>
              update((d) => {
                d.calendar.closures![i].reason = x;
              })
            }
          />
          <SelectorEditor
            s={s}
            value={c.selector}
            onChange={(x) =>
              update((d) => {
                d.calendar.closures![i].selector = x;
              })
            }
          />
          {c.exceptions.map((x, j) => (
            <div className="item-card" key={j}>
              <Text
                label={t("Authorized opening date")}
                type="date"
                value={x.date}
                onChange={(v) =>
                  update((d) => {
                    d.calendar.closures![i].exceptions[j].date = v;
                  })
                }
              />
              <Text
                label={t("Authorization reason")}
                value={x.reason}
                onChange={(v) =>
                  update((d) => {
                    d.calendar.closures![i].exceptions[j].reason = v;
                  })
                }
              />
              <SelectorEditor
                s={s}
                value={x.selector}
                onChange={(v) =>
                  update((d) => {
                    d.calendar.closures![i].exceptions[j].selector = v;
                  })
                }
              />
              <button
                onClick={() =>
                  update((d) => {
                    d.calendar.closures![i].exceptions.splice(j, 1);
                  })
                }
              >
                {t("Remove exception")}
              </button>
            </div>
          ))}
          <AddRow
            label={t("Authorize a work exception")}
            onAdd={() =>
              update((d) => {
                d.calendar.closures![i].exceptions.push({
                  date: c.validFrom,
                  selector: {},
                  authorized: true,
                  reason: "",
                });
              })
            }
          />
        </article>
      ))}
      <AddRow
        label={t("Create company closure")}
        onAdd={() =>
          update((d) => {
            initializeEvolution(d);
            const until = new Date(d.calendar.start + "T12:00:00Z");
            until.setUTCDate(until.getUTCDate() + 1);
            d.calendar.closures!.push({
              id: id("closure"),
              label: t("Company closure"),
              validFrom: d.calendar.start,
              validTo: until.toISOString().slice(0, 10),
              selector: {},
              reason: "",
              exceptions: [],
            });
          })
        }
      />
    </section>
  );
}
export function CoverageRules({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  return (
    <>
      <EntityHeader title={t("Coverage & temporal rules")} />
      <p className="intro">
        {t(
          "Operational duties require qualified people and actual hours. Preferred resources are exhausted before fallback resources are used to improve fairness.",
        )}
      </p>
      <section className="panel">
        <h3>{t("Operational requirements")}</h3>
        {(s.dutyRequirements || []).map((r, i) => (
          <article className="item-card" key={r.id}>
            <div className="row">
              <Text
                label={t("Responsibility label")}
                value={r.label}
                onChange={(x) =>
                  update((d) => {
                    d.dutyRequirements![i].label = x;
                  })
                }
              />
              <Select
                label={t("Coverage mode")}
                value={r.mode}
                options={[
                  {
                    id: "RESPONSIBILITY",
                    label: t("One responsibility per selected person"),
                  },
                  {
                    id: "PRESENCE",
                    label: t("Physical presence across intervals"),
                  },
                ]}
                onChange={(x) =>
                  update((d) => {
                    d.dutyRequirements![i].mode = x as
                      | "RESPONSIBILITY"
                      | "PRESENCE";
                  })
                }
              />
              <Select
                label={t("Cardinality")}
                value={r.comparison}
                options={[
                  { id: "EQ", label: t("Exactly") },
                  { id: "GE", label: t("At least") },
                  { id: "LE", label: t("At most") },
                ]}
                onChange={(x) =>
                  update((d) => {
                    d.dutyRequirements![i].comparison = x as "EQ" | "GE" | "LE";
                  })
                }
              />
              <Text
                label={t("People required")}
                type="number"
                value={r.count}
                onChange={(x) =>
                  update((d) => {
                    d.dutyRequirements![i].count = Number(x);
                  })
                }
              />
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.dutyRequirements!.splice(i, 1);
                  })
                }
              >
                {t("Remove requirement")}
              </button>
            </div>
            <Multi
              createKind="shift"
              label={t("Logical shifts that can satisfy this duty")}
              options={s.shifts}
              values={r.shiftIds}
              onChange={(x) =>
                update((d) => {
                  d.dutyRequirements![i].shiftIds = x;
                })
              }
            />
            <ScopeEditor
              s={s}
              value={r.scope}
              onChange={(x) =>
                update((d) => {
                  d.dutyRequirements![i].scope = x;
                })
              }
            />
            <h4>{t("Primary resources and fallback levels")}</h4>
            {r.levels.map((l, j) => (
              <div className="item-card" key={j}>
                <Text
                  label={t("Preference level (0 is primary)")}
                  type="number"
                  value={l.level}
                  onChange={(x) =>
                    update((d) => {
                      d.dutyRequirements![i].levels[j].level = Number(x);
                    })
                  }
                />
                <SelectorEditor
                  s={s}
                  value={l.selector}
                  onChange={(x) =>
                    update((d) => {
                      d.dutyRequirements![i].levels[j].selector = x;
                    })
                  }
                />
                <button
                  onClick={() =>
                    update((d) => {
                      d.dutyRequirements![i].levels.splice(j, 1);
                    })
                  }
                >
                  {t("Remove resource level")}
                </button>
              </div>
            ))}
            <AddRow
              label={t("Add fallback resource level")}
              onAdd={() =>
                update((d) => {
                  d.dutyRequirements![i].levels.push({
                    level: Math.max(...r.levels.map((l) => l.level), 0) + 1,
                    selector: {},
                  });
                })
              }
            />
            <IntervalEditor
              value={r.intervals}
              onChange={(x) =>
                update((d) => {
                  d.dutyRequirements![i].intervals = x;
                })
              }
            />
            <details>
              <summary>{t("Distinct duties and objective priority")}</summary>
              <Text
                label={t("Fallback priority (lower first)")}
                type="number"
                value={r.preferencePriority}
                onChange={(x) =>
                  update((d) => {
                    d.dutyRequirements![i].preferencePriority = Number(x);
                  })
                }
              />
              <label className="field">
                <span>{t("Exclusive responsibility group (optional)")}</span>
                <input
                  list="responsibility-groups"
                  value={r.exclusiveGroup || ""}
                  onChange={(e) =>
                    update((d) => {
                      if (e.target.value)
                        d.dutyRequirements![i].exclusiveGroup = e.target.value;
                      else delete d.dutyRequirements![i].exclusiveGroup;
                    })
                  }
                />
              </label>
              <datalist id="responsibility-groups">
                {[
                  ...new Set(
                    (s.dutyRequirements || []).flatMap((r) =>
                      r.exclusiveGroup ? [r.exclusiveGroup] : [],
                    ),
                  ),
                ].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <label>
                <input
                  type="checkbox"
                  checked={r.bindAssignments !== false}
                  onChange={(e) =>
                    update((d) => {
                      d.dutyRequirements![i].bindAssignments = e.target.checked;
                    })
                  }
                />
                {t("Every matching shift must cover a declared responsibility")}
              </label>
            </details>
          </article>
        ))}
        <AddRow
          label={t("Add coverage requirement")}
          onAdd={() =>
            update((d) => {
              initializeEvolution(d);
              d.dutyRequirements!.push({
                id: id("duty"),
                label: t("New responsibility"),
                mode: "RESPONSIBILITY",
                shiftIds: d.shifts
                  .filter((x) => x.kind === "WORKING")
                  .slice(0, 1)
                  .map((x) => x.id),
                levels: [{ selector: {}, level: 0 }],
                comparison: "EQ",
                count: 1,
                intervals: [],
                scope: {},
                preferencePriority: 0,
                exclusiveGroup: "daily-duties",
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Rules between calendar days")}</h3>
        <p className="hint">
          {t(
            "Elapsed rest uses offline UTC or Europe/Rome data (Rome: 2000–2100). Other zones are rejected for elapsed-time rules.",
          )}
        </p>
        {(s.temporalRules || []).map((r, i) => (
          <article className="item-card" key={r.id}>
            <div className="row">
              <Text
                label={t("Temporal rule label")}
                value={r.label}
                onChange={(x) =>
                  update((d) => {
                    d.temporalRules![i].label = x;
                  })
                }
              />
              <Select
                label={t("Rule type")}
                value={r.type}
                options={[
                  { id: "SUCCESSION", label: t("Allowed successor shifts") },
                  {
                    id: "FORBIDDEN_PAIR",
                    label: t("Forbidden shift sequence"),
                  },
                  { id: "MIN_REST", label: t("Minimum elapsed rest") },
                ]}
                onChange={(x) =>
                  update((d) => {
                    d.temporalRules![i].type = x as
                      | "SUCCESSION"
                      | "FORBIDDEN_PAIR"
                      | "MIN_REST";
                    if (x === "MIN_REST")
                      d.temporalRules![i].minimumMinutes = 660;
                    else delete d.temporalRules![i].minimumMinutes;
                  })
                }
              />
              {r.type === "MIN_REST" ? (
                <Text
                  label={t("Minimum rest in actual minutes")}
                  type="number"
                  value={r.minimumMinutes || 0}
                  onChange={(x) =>
                    update((d) => {
                      d.temporalRules![i].minimumMinutes = Number(x);
                    })
                  }
                />
              ) : (
                <Text
                  label={t("Calendar day offset")}
                  type="number"
                  value={r.offsetDays}
                  onChange={(x) =>
                    update((d) => {
                      d.temporalRules![i].offsetDays = Number(x);
                    })
                  }
                />
              )}
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.temporalRules!.splice(i, 1);
                  })
                }
              >
                {t("Remove temporal rule")}
              </button>
            </div>
            <SelectorEditor
              s={s}
              value={r.selector}
              onChange={(x) =>
                update((d) => {
                  d.temporalRules![i].selector = x;
                })
              }
            />
            <Multi
              createKind="shift"
              label={t("Trigger shifts (empty means all)")}
              values={r.fromShiftIds}
              options={s.shifts}
              onChange={(x) =>
                update((d) => {
                  d.temporalRules![i].fromShiftIds = x;
                })
              }
            />
            <Multi
              createKind="shift"
              label={t("Successor shifts")}
              values={r.toShiftIds}
              options={s.shifts}
              onChange={(x) =>
                update((d) => {
                  d.temporalRules![i].toShiftIds = x;
                })
              }
            />
            <ScopeEditor
              s={s}
              value={r.scope}
              onChange={(x) =>
                update((d) => {
                  d.temporalRules![i].scope = x;
                })
              }
            />
          </article>
        ))}
        <AddRow
          label={t("Add temporal rule")}
          onAdd={() =>
            update((d) => {
              initializeEvolution(d);
              d.temporalRules!.push({
                id: id("transition"),
                label: t("Next-day rest"),
                type: "SUCCESSION",
                selector: {},
                fromShiftIds: d.shifts
                  .filter((x) => x.kind === "WORKING")
                  .slice(0, 1)
                  .map((x) => x.id),
                toShiftIds: d.shifts
                  .filter((x) => x.kind === "OFF")
                  .map((x) => x.id),
                offsetDays: 1,
                scope: {},
              });
            })
          }
        />
      </section>
    </>
  );
}
