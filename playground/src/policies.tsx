import { useI18n } from "./i18n";
import {
  type Scenario,
  type Policy,
  metrics,
  metricNames,
  newPolicy,
  newConstraint,
  id,
  download,
} from "./model";
import {
  Text,
  Select,
  Multi,
  SelectorEditor,
  ScopeEditor,
  ConstraintEditor,
  AddRow,
  EntityHeader,
} from "./editors";
import { type Update } from "./setup";
export function Policies({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  const set = (i: number, fn: (p: Policy) => void) =>
    update((d) => fn(d.policies[i]));
  return (
    <>
      <EntityHeader title={t("Planning policies")}>
        <button
          onClick={() =>
            update((d) => {
              d.policies.push(newPolicy(d, t));
            })
          }
        >
          {t("＋ Add policy")}{" "}
        </button>
      </EntityHeader>
      <p className="intro">
        {t(
          "Each policy combines an objective with hard constraints. Active policies solve together. Lower priority numbers run first; ties follow policy ID.",
        )}{" "}
      </p>
      {s.policies.map((p, i) => (
        <section className="panel policy" key={i}>
          <div className="policy-title">
            <h3>{p.label || p.id}</h3>
            <span className="badge">
              {t("revision {revision}", { revision: p.revision })}
            </span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) =>
                  set(i, (p) => {
                    p.active = e.target.checked;
                  })
                }
              />
              {t("Active")}{" "}
            </label>
          </div>
          <div className="row">
            <Text
              label={t("Policy ID")}
              value={p.id}
              onChange={(v) =>
                set(i, (p) => {
                  p.id = v;
                })
              }
            />
            <Text
              label={t("Policy label")}
              value={p.label}
              onChange={(v) =>
                set(i, (p) => {
                  p.label = v;
                })
              }
            />
            <Text
              label={t("Revision")}
              type="number"
              value={p.revision}
              onChange={(v) =>
                set(i, (p) => {
                  p.revision = Number(v);
                })
              }
            />
            <Text
              label={t("Priority")}
              type="number"
              value={p.objective.priority}
              onChange={(v) =>
                set(i, (p) => {
                  p.objective.priority = Number(v);
                })
              }
            />
          </div>
          <details>
            <summary>{t("Policy scope & draft status")}</summary>
            <ScopeEditor
              s={s}
              value={p.scope || {}}
              onChange={(v) =>
                set(i, (p) => {
                  p.scope = v;
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={p.draft}
                onChange={(e) =>
                  set(i, (p) => {
                    p.draft = e.target.checked;
                  })
                }
              />{" "}
              {t("Unresolved draft")}{" "}
            </label>
            {p.dependencies.length > 0 && (
              <p className="hint">
                {t(
                  "Resolve {count} symbolic dependencies in AI & HR imports before activation.",
                  { count: p.dependencies.length },
                )}{" "}
              </p>
            )}
          </details>
          <div className="objective">
            <h4>{t("Cumulative fairness · count")}</h4>
            <div className="row">
              <Text
                label={t("Objective ID")}
                value={p.objective.id}
                onChange={(v) =>
                  set(i, (p) => {
                    p.objective.id = v;
                  })
                }
              />
              <Text
                label={t("Objective label")}
                value={p.objective.label || ""}
                onChange={(v) =>
                  set(i, (p) => {
                    p.objective.label = v;
                  })
                }
              />
              <Select
                label={t("Participation")}
                value={p.objective.participation}
                options={[
                  { id: "EQUAL", label: t("Equal · all selected people") },
                  {
                    id: "AVAILABILITY_WEIGHTED",
                    label: t("Availability weighted · eligible that day"),
                  },
                  {
                    id: "CUSTOM_WEIGHTED",
                    label: t("Custom weights · all selected people"),
                  },
                ]}
                onChange={(v) =>
                  set(i, (p) => {
                    p.objective.participation =
                      v as Policy["objective"]["participation"];
                    if (v === "CUSTOM_WEIGHTED")
                      p.objective.weights = Object.fromEntries(
                        s.employees.map((e) => [e.id, 1]),
                      );
                    else delete p.objective.weights;
                  })
                }
              />
            </div>
            <SelectorEditor
              s={s}
              value={p.objective.selector}
              onChange={(v) =>
                set(i, (p) => {
                  p.objective.selector = v;
                })
              }
            />
            <Multi
              label={t("Shifts to balance as one category")}
              options={s.shifts}
              values={p.objective.shiftIds}
              onChange={(v) =>
                set(i, (p) => {
                  p.objective.shiftIds = v;
                })
              }
            />
            {p.objective.participation === "CUSTOM_WEIGHTED" && (
              <div className="row">
                {s.employees.map((e) => (
                  <Text
                    key={e.id}
                    label={t("Weight · {employee}", { employee: e.label })}
                    type="number"
                    value={p.objective.weights?.[e.id] || 1}
                    onChange={(v) =>
                      set(i, (p) => {
                        p.objective.weights = {
                          ...p.objective.weights,
                          [e.id]: Number(v),
                        };
                      })
                    }
                  />
                ))}
              </div>
            )}
            {!!s.shifts.some((sh) => sh.fairnessTags?.length) && (
              <Multi
                label={t(
                  "Equivalent fairness categories (assignments count once)",
                )}
                options={[
                  ...new Set(s.shifts.flatMap((sh) => sh.fairnessTags || [])),
                ].map((id) => ({ id, label: id }))}
                values={p.objective.fairnessTags || []}
                onChange={(x) =>
                  set(i, (p) => {
                    p.objective.fairnessTags = x;
                  })
                }
              />
            )}
            <h4>{t("Lexicographic metric order")}</h4>
            {p.objective.metrics.map((m, j) => (
              <div className="metric-row" key={m}>
                <span className="step">{j + 1}</span>
                {t(metricNames[m] || m)}
                <button
                  className="subtle"
                  aria-label={t("Move metric up")}
                  disabled={j === 0}
                  onClick={() =>
                    set(i, (p) => {
                      [p.objective.metrics[j - 1], p.objective.metrics[j]] = [
                        p.objective.metrics[j],
                        p.objective.metrics[j - 1],
                      ];
                    })
                  }
                >
                  ↑
                </button>
                <button
                  className="subtle"
                  aria-label={t("Remove metric")}
                  onClick={() =>
                    set(i, (p) => {
                      p.objective.metrics.splice(j, 1);
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="row">
              {metrics
                .filter((m) => !p.objective.metrics.includes(m))
                .map((m) => (
                  <button
                    key={m}
                    onClick={() =>
                      set(i, (p) => {
                        p.objective.metrics.push(m);
                      })
                    }
                  >
                    ＋ {t(metricNames[m])}
                  </button>
                ))}
            </div>
            <ScopeEditor
              s={s}
              value={p.objective.scope || {}}
              onChange={(v) =>
                set(i, (p) => {
                  p.objective.scope = v;
                })
              }
            />
          </div>
          <h4>{t("Policy hard constraints")}</h4>
          {p.constraints.map((c, j) => (
            <ConstraintEditor
              key={j}
              s={s}
              value={c}
              onChange={(v) =>
                set(i, (p) => {
                  p.constraints[j] = v;
                })
              }
              onRemove={() =>
                set(i, (p) => {
                  p.constraints.splice(j, 1);
                })
              }
            />
          ))}
          <AddRow
            label={t("Add policy rule")}
            onAdd={() =>
              set(i, (p) => {
                p.constraints.push(newConstraint(s, t));
              })
            }
          />
          <details>
            <summary>{t("Reusable constraints")}</summary>
            <Multi
              label={t("Shared rules")}
              options={s.constraints.map((c) => ({
                id: c.id,
                label: c.label || c.id,
              }))}
              values={p.sharedConstraintIds}
              onChange={(v) =>
                set(i, (p) => {
                  p.sharedConstraintIds = v;
                })
              }
            />
            <Multi
              label={t("Constraint sets")}
              options={s.constraintSets}
              values={p.constraintSetIds}
              onChange={(v) =>
                set(i, (p) => {
                  p.constraintSetIds = v;
                })
              }
            />
          </details>
          <div className="row policy-actions">
            <button
              onClick={() =>
                download(`${p.id}.policy.json`, {
                  format: "rostercore.planning-policy",
                  schemaVersion: s.schemaVersion,
                  engineVersion:
                    s.schemaVersion === 3
                      ? "0.3.0"
                      : s.schemaVersion === 2
                        ? "0.2.0"
                        : "0.1.0",
                  operation: "CREATE",
                  policy: { ...p, revision: 1 },
                })
              }
            >
              {t("Export policy")}{" "}
            </button>
            <button
              className="danger"
              onClick={() =>
                update((d) => {
                  d.policies.splice(i, 1);
                })
              }
            >
              {t("Remove policy")}{" "}
            </button>
          </div>
        </section>
      ))}
      <section className="panel">
        <h3>{t("Shared constraints")}</h3>
        <p className="hint">
          {t(
            "Shared rules are reusable by policy reference. Select base rules to enforce them independently of any policy.",
          )}{" "}
        </p>
        <Multi
          label={t("Always-active base rules")}
          options={s.constraints.map((c) => ({
            id: c.id,
            label: c.label || c.id,
          }))}
          values={s.baseConstraintIds}
          onChange={(v) =>
            update((d) => {
              d.baseConstraintIds = v;
            })
          }
        />
        {s.constraints.map((c, i) => (
          <ConstraintEditor
            key={i}
            s={s}
            value={c}
            onChange={(v) =>
              update((d) => {
                d.constraints[i] = v;
              })
            }
            onRemove={() =>
              update((d) => {
                d.constraints.splice(i, 1);
              })
            }
          />
        ))}
        <AddRow
          label={t("Add shared rule")}
          onAdd={() =>
            update((d) => {
              d.constraints.push(newConstraint(s, t));
            })
          }
        />
        <h4>{t("Constraint sets")}</h4>
        {s.constraintSets.map((set, i) => (
          <article className="item-card" key={i}>
            <div className="row">
              <Text
                label={t("Set ID")}
                value={set.id}
                onChange={(v) =>
                  update((d) => {
                    d.constraintSets[i].id = v;
                  })
                }
              />
              <Text
                label={t("Set label")}
                value={set.label}
                onChange={(v) =>
                  update((d) => {
                    d.constraintSets[i].label = v;
                  })
                }
              />
              <button
                className="danger"
                onClick={() =>
                  update((d) => {
                    d.constraintSets.splice(i, 1);
                  })
                }
              >
                {t("Remove set")}{" "}
              </button>
            </div>
            <Multi
              label={t("Included rules")}
              options={s.constraints.map((c) => ({
                id: c.id,
                label: c.label || c.id,
              }))}
              values={set.constraintIds}
              onChange={(v) =>
                update((d) => {
                  d.constraintSets[i].constraintIds = v;
                })
              }
            />
          </article>
        ))}
        <AddRow
          label={t("Add constraint set")}
          onAdd={() =>
            update((d) => {
              d.constraintSets.push({
                id: id("set"),
                label: t("Reusable rules"),
                constraintIds: [],
              });
            })
          }
        />
      </section>
    </>
  );
}
