import {
  PatternChoice,
  AssignmentOrigin,
  VariantApplicability,
  ReviewDialog,
  enableAssignmentRules,
} from "./pattern-assignments";
import { useEffect, useState, type ReactNode } from "react";
import { type Scenario, type Selector, type Scope, id } from "./model";
import {
  type AttributeDefinition,
  type Scalar,
  type Interval,
  type Condition,
  type EmployeeVersion,
  type WeekProfile,
  initializeEvolution,
  isoMonday,
} from "./evolution-model";
import {
  Text,
  Select,
  Multi,
  SelectorEditor,
  ScopeEditor,
  AddRow,
  EntityHeader,
  Field,
} from "./editors";
import { type Update } from "./setup";
import { useI18n } from "./i18n";
import { coreAction } from "./api";
import type { Result } from "./model";

export function UpgradeNotice({
  s,
  onUpgrade,
}: {
  s: Scenario;
  onUpgrade: () => void;
}) {
  const { t } = useI18n();
  return s.schemaVersion < 4 ? (
    <div className="notice">
      <p>
        {t(
          "This legacy scenario remains supported. Upgrade its format to enable the new catalogues without changing IDs or history.",
        )}
      </p>
      <button onClick={onUpgrade}>{t("Upgrade scenario format")}</button>
    </div>
  ) : null;
}
function Card({
  title,
  children,
  remove,
  duplicate,
}: {
  title: string;
  children: ReactNode;
  remove?: () => void;
  duplicate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <article className="item-card">
      <div className="section-head">
        <h3>{title}</h3>
        <div className="row">
          {duplicate && <button onClick={duplicate}>{t("Duplicate")}</button>}
          {remove && (
            <button className="danger" onClick={remove}>
              {t("Remove")}
            </button>
          )}
        </div>
      </div>
      {children}
    </article>
  );
}
export function IntervalEditor({
  value,
  onChange,
}: {
  value: Interval[];
  onChange: (v: Interval[]) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="hint">
        {t(
          "Intervals use local civil times. Next-day ends are explicit; ambiguous DST times require a fold.",
        )}
      </div>
      {value.map((v, i) => (
        <div className="row" key={i}>
          <Text
            label={t("Start")}
            type="time"
            value={v.start}
            onChange={(x) =>
              onChange(value.map((a, j) => (i === j ? { ...a, start: x } : a)))
            }
          />
          <Text
            label={t("End")}
            type="time"
            value={v.end}
            onChange={(x) =>
              onChange(value.map((a, j) => (i === j ? { ...a, end: x } : a)))
            }
          />
          <Select
            label={t("End date")}
            value={String(v.endDayOffset)}
            options={[
              { id: "0", label: t("Same day") },
              { id: "1", label: t("Next day") },
            ]}
            onChange={(x) =>
              onChange(
                value.map((a, j) =>
                  i === j ? { ...a, endDayOffset: Number(x) } : a,
                ),
              )
            }
          />
          <button
            aria-label={t("Remove interval")}
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            ×
          </button>
          <details>
            <summary>{t("DST ambiguity")}</summary>
            {(["startFold", "endFold"] as const).map((key) => (
              <Select
                key={key}
                label={key === "startFold" ? t("Start fold") : t("End fold")}
                value={v[key] === undefined ? "" : String(v[key])}
                options={[
                  { id: "", label: t("Reject ambiguous time") },
                  { id: "0", label: t("Earlier occurrence") },
                  { id: "1", label: t("Later occurrence") },
                ]}
                onChange={(x) => {
                  const next = structuredClone(value);
                  if (x === "") delete next[i][key];
                  else next[i][key] = Number(x) as 0 | 1;
                  onChange(next);
                }}
              />
            ))}
          </details>
        </div>
      ))}
      <AddRow
        label={t("Add time interval")}
        onAdd={() =>
          onChange([
            ...value,
            { start: "09:00", end: "17:00", endDayOffset: 0 },
          ])
        }
      />
    </>
  );
}
export function ScalarInput({
  definition,
  value,
  onChange,
  label,
}: {
  definition: AttributeDefinition;
  value: Scalar;
  onChange: (v: Scalar) => void;
  label?: string;
}) {
  const { t } = useI18n();
  const title = label || definition.label;
  if (definition.type === "BOOLEAN")
    return (
      <Select
        label={title}
        value={String(value)}
        options={[
          { id: "true", label: t("Yes") },
          { id: "false", label: t("No") },
        ]}
        onChange={(x) => onChange(x === "true")}
      />
    );
  if (definition.type === "ENUM")
    return (
      <Select
        label={title}
        value={JSON.stringify(value)}
        options={(definition.values || []).map((x) => ({
          id: JSON.stringify(x),
          label: String(x),
        }))}
        onChange={(x) => onChange(JSON.parse(x))}
      />
    );
  return (
    <Text
      label={title}
      type={["NUMBER", "INTEGER"].includes(definition.type) ? "number" : "text"}
      value={String(value)}
      onChange={(x) =>
        onChange(
          ["NUMBER", "INTEGER"].includes(definition.type) ? Number(x) : x,
        )
      }
    />
  );
}
const initialValue = (a: AttributeDefinition): Scalar =>
  a.default ??
  (a.type === "BOOLEAN"
    ? false
    : a.type === "ENUM"
      ? (a.values?.[0] ?? "")
      : ["NUMBER", "INTEGER"].includes(a.type)
        ? 0
        : "");
export function PredicateEditor({
  s,
  value,
  onChange,
}: {
  s: Scenario;
  value: Condition;
  onChange: (v: Condition) => void;
}) {
  const { t } = useI18n();
  const definitions = s.attributeDefinitions || [],
    first = definitions[0];
  const atom = (): Condition => ({
    op: "EQ",
    attributeId: first?.id || "",
    value: first ? initialValue(first) : "",
  });
  const group = value.op === "AND" || value.op === "OR";
  const negate = value.op === "NOT";
  return (
    <div className="expression">
      <Select
        label={t("Attribute condition")}
        value={value.op}
        options={[
          "EQ",
          "NE",
          "IN",
          "NOT_IN",
          "EXISTS",
          "NOT_EXISTS",
          "LT",
          "LE",
          "GT",
          "GE",
          "AND",
          "OR",
          "NOT",
        ].map((op) => ({ id: op, label: t(op) }))}
        onChange={(op) => {
          if (op === "AND" || op === "OR") onChange({ op, children: [value] });
          else if (op === "NOT") onChange({ op, child: value });
          else if (op === "EXISTS" || op === "NOT_EXISTS")
            onChange({ op, attributeId: first?.id || "" });
          else if (op === "IN" || op === "NOT_IN")
            onChange({
              op,
              attributeId: first?.id || "",
              values: first ? [initialValue(first)] : [],
            });
          else onChange({ ...atom(), op } as Condition);
        }}
      />
      {group ? (
        <>
          {value.children.map((v, i) => (
            <div className="child" key={i}>
              <PredicateEditor
                s={s}
                value={v}
                onChange={(x) =>
                  onChange({
                    ...value,
                    children: value.children.map((v, j) => (i === j ? x : v)),
                  })
                }
              />
              <button
                aria-label={t("Remove condition")}
                onClick={() =>
                  onChange({
                    ...value,
                    children: value.children.filter((_, j) => i !== j),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <AddRow
            label={t("Add condition")}
            onAdd={() =>
              onChange({ ...value, children: [...value.children, atom()] })
            }
          />
        </>
      ) : negate ? (
        <PredicateEditor
          s={s}
          value={value.child}
          onChange={(child) => onChange({ op: "NOT", child })}
        />
      ) : (
        <>
          <Select
            createKind="attribute"
            label={t("Registered attribute")}
            value={value.attributeId}
            options={definitions}
            onChange={(attributeId) => {
              const a = definitions.find((a) => a.id === attributeId)!;
              if (value.op === "IN" || value.op === "NOT_IN")
                onChange({ ...value, attributeId, values: [initialValue(a)] });
              else if ("value" in value)
                onChange({ ...value, attributeId, value: initialValue(a) });
              else onChange({ ...value, attributeId });
            }}
          />
          {(() => {
            const a = definitions.find((x) => x.id === value.attributeId);
            if (!a)
              return (
                <p className="error">
                  {t("Create or select an attribute definition first.")}
                </p>
              );
            if ("value" in value)
              return (
                <ScalarInput
                  definition={a}
                  value={value.value}
                  onChange={(x) => onChange({ ...value, value: x })}
                />
              );
            if ("values" in value)
              return (
                <>
                  {value.values.map((v, i) => (
                    <div className="row" key={i}>
                      <ScalarInput
                        definition={a}
                        value={v}
                        onChange={(x) =>
                          onChange({
                            ...value,
                            values: value.values.map((v, j) =>
                              i === j ? x : v,
                            ),
                          })
                        }
                      />
                      <button
                        aria-label={t("Remove value")}
                        onClick={() =>
                          onChange({
                            ...value,
                            values: value.values.filter((_, j) => i !== j),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <AddRow
                    label={t("Add value")}
                    onAdd={() =>
                      onChange({
                        ...value,
                        values: [...value.values, initialValue(a)],
                      })
                    }
                  />
                </>
              );
            return null;
          })()}
        </>
      )}
    </div>
  );
}
function Values({
  s,
  value,
  onChange,
}: {
  s: Scenario;
  value: Record<string, Scalar | null>;
  onChange: (v: Record<string, Scalar | null>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="attribute-grid">
      {(s.attributeDefinitions || [])
        .filter((a) => a.visible !== false)
        .map((a) => (
          <div className="item-card" key={a.id}>
            <Select
              label={a.label}
              value={
                Object.hasOwn(value, a.id)
                  ? value[a.id] === null
                    ? "MISSING"
                    : "EXPLICIT"
                  : "DEFAULT"
              }
              options={[
                { id: "DEFAULT", label: t("Inherited default") },
                { id: "EXPLICIT", label: t("Explicit value") },
                { id: "MISSING", label: t("Explicitly missing") },
              ]}
              onChange={(mode) => {
                const next = { ...value };
                if (mode === "DEFAULT") delete next[a.id];
                else next[a.id] = mode === "MISSING" ? null : initialValue(a);
                onChange(next);
              }}
            />
            {Object.hasOwn(value, a.id) && value[a.id] !== null ? (
              <ScalarInput
                definition={a}
                value={value[a.id]!}
                onChange={(v) => onChange({ ...value, [a.id]: v })}
              />
            ) : (
              <small className="muted">
                {Object.hasOwn(value, a.id)
                  ? t("Missing")
                  : a.default === undefined
                    ? t("No default")
                    : t("Default: {value}", { value: String(a.default) })}
              </small>
            )}
          </div>
        ))}
    </div>
  );
}
function scheduleVersion(
  employee: Scenario["employees"][number],
  patch: EmployeeVersion,
) {
  const versions = (employee.versions ??= []);
  const previous = versions
    .filter(
      (v) =>
        v.validFrom < patch.validFrom &&
        (!v.validTo || v.validTo > patch.validFrom),
    )
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    .at(-1);
  const next = versions
    .filter((v) => v.validFrom > patch.validFrom)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
  const merged = {
    ...(previous || {}),
    ...patch,
    attributes: {
      ...(previous?.attributes || {}),
      ...(patch.attributes || {}),
    },
  };
  if (next) merged.validTo = next.validFrom;
  else delete merged.validTo;
  if (previous) previous.validTo = patch.validFrom;
  employee.versions = [
    ...versions.filter((v) => v.validFrom !== patch.validFrom),
    merged,
  ].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
}
export function Workforce({ s, update }: { s: Scenario; update: Update }) {
  const { t, diagnostic, localizeError } = useI18n();
  const [chosen, setChosen] = useState<string[]>([]),
    [attribute, setAttribute] = useState(""),
    [bulk, setBulk] = useState<Scalar>(""),
    [from, setFrom] = useState(s.calendar.start),
    [previewDate, setPreviewDate] = useState(s.calendar.start),
    [preview, setPreview] = useState<Result>(),
    [error, setError] = useState("");
  const [assignmentPreview, setAssignmentPreview] = useState<Result>();
  const [bulkReview, setBulkReview] = useState<{
    employeeIds: string[];
    attributeId: string;
    value: Scalar;
    from?: string;
  }>();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      coreAction(
        "inspect-patterns",
        s,
        { onDate: previewDate },
        { silent: true },
      )
        .then((r) => {
          if (active) setAssignmentPreview(r);
        })
        .catch(() => {});
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [s, previewDate]);
  const definitions = s.attributeDefinitions || [];
  return (
    <>
      {bulkReview && (
        <ReviewDialog
          title={t("Review workforce changes")}
          onCancel={() => setBulkReview(undefined)}
          onConfirm={() => {
            update((d) => {
              for (const employee of d.employees)
                if (bulkReview.employeeIds.includes(employee.id)) {
                  if (bulkReview.from)
                    scheduleVersion(employee, {
                      validFrom: bulkReview.from,
                      attributes: {
                        [bulkReview.attributeId]: bulkReview.value,
                      },
                    });
                  else
                    employee.attributes[bulkReview.attributeId] =
                      bulkReview.value;
                }
            });
            setBulkReview(undefined);
          }}
        >
          <p>
            {t("Affected employees: {count}", {
              count: bulkReview.employeeIds.length,
            })}
          </p>
          <p>
            {bulkReview.employeeIds
              .map((id) => s.employees.find((e) => e.id === id)?.label ?? id)
              .join(", ")}
          </p>
          <p>
            {definitions.find((a) => a.id === bulkReview.attributeId)?.label}:{" "}
            {String(bulkReview.value)} ·{" "}
            {bulkReview.from ?? t("Base individual value")}
          </p>
        </ReviewDialog>
      )}
      <section className="panel">
        <EntityHeader title={t("Reusable attributes")} />
        <p className="hint">
          {t(
            "Define each attribute once. Defaults, explicit values and missing values remain distinct.",
          )}
        </p>
        {definitions.map((a, i) => (
          <Card
            key={a.id}
            title={a.label}
            remove={() =>
              update((d) => {
                d.attributeDefinitions!.splice(i, 1);
              })
            }
          >
            <div className="row">
              <Text
                label={t("Attribute label")}
                value={a.label}
                onChange={(x) =>
                  update((d) => {
                    d.attributeDefinitions![i].label = x;
                  })
                }
              />
              <Select
                label={t("Value type")}
                value={a.type}
                options={["STRING", "BOOLEAN", "NUMBER", "INTEGER", "ENUM"].map(
                  (x) => ({ id: x, label: t(x) }),
                )}
                onChange={(x) =>
                  update((d) => {
                    const def = d.attributeDefinitions![i];
                    def.type = x as AttributeDefinition["type"];
                    delete def.default;
                    if (x === "ENUM") def.values = ["FULL_TIME", "PART_TIME"];
                    else delete def.values;
                  })
                }
              />
              <Text
                label={t("Unit (optional)")}
                value={a.unit || ""}
                onChange={(x) =>
                  update((d) => {
                    d.attributeDefinitions![i].unit = x;
                  })
                }
              />
            </div>
            {a.type === "ENUM" && (
              <Text
                label={t("Allowed values, separated by commas")}
                value={(a.values || []).join(", ")}
                onChange={(x) =>
                  update((d) => {
                    d.attributeDefinitions![i].values = x
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean);
                  })
                }
              />
            )}
            <label>
              <input
                type="checkbox"
                checked={a.default !== undefined}
                onChange={(e) =>
                  update((d) => {
                    const def = d.attributeDefinitions![i];
                    if (e.target.checked) def.default = initialValue(def);
                    else delete def.default;
                  })
                }
              />
              {t("Provide a default value")}
            </label>
            {a.default !== undefined && (
              <ScalarInput
                definition={a}
                value={a.default}
                onChange={(x) =>
                  update((d) => {
                    d.attributeDefinitions![i].default = x;
                  })
                }
              />
            )}
            <Text
              label={t("Description")}
              value={a.description || ""}
              onChange={(x) =>
                update((d) => {
                  d.attributeDefinitions![i].description = x;
                })
              }
            />
            <details>
              <summary>{t("Stable reference")}</summary>
              <label>
                <input
                  type="checkbox"
                  checked={a.visible !== false}
                  onChange={(e) =>
                    update((d) => {
                      d.attributeDefinitions![i].visible = e.target.checked;
                    })
                  }
                />
                {t("Visible in employee editors")}
              </label>
              {(["validFrom", "validTo"] as const).map((key) => (
                <Text
                  key={key}
                  type="date"
                  label={
                    key === "validFrom"
                      ? t("Valid from")
                      : t("Valid until (exclusive)")
                  }
                  value={a[key] || ""}
                  onChange={(x) =>
                    update((d) => {
                      if (x) d.attributeDefinitions![i][key] = x;
                      else delete d.attributeDefinitions![i][key];
                    })
                  }
                />
              ))}
              <Text
                label={t("Attribute ID")}
                value={a.id}
                onChange={(x) =>
                  update((d) => {
                    d.attributeDefinitions![i].id = x;
                  })
                }
              />
            </details>
          </Card>
        ))}
        <AddRow
          label={t("Create attribute definition")}
          onAdd={() =>
            update((d) => {
              initializeEvolution(d);
              d.attributeDefinitions!.push({
                id: id("attribute"),
                label: t("New attribute"),
                type: "STRING",
                visible: true,
              });
            })
          }
        />
      </section>
      <section className="panel">
        <h3>{t("Bulk and future changes")}</h3>
        <Multi
          label={t("Selected employees")}
          options={s.employees}
          values={chosen}
          onChange={setChosen}
        />
        <div className="row">
          <Select
            createKind="attribute"
            label={t("Registered attribute")}
            value={attribute}
            options={[
              { id: "", label: t("Select an attribute") },
              ...definitions,
            ]}
            onChange={(x) => {
              setAttribute(x);
              const a = definitions.find((a) => a.id === x);
              if (a) setBulk(initialValue(a));
            }}
          />
          {definitions.find((a) => a.id === attribute) && (
            <ScalarInput
              definition={definitions.find((a) => a.id === attribute)!}
              value={bulk}
              onChange={setBulk}
            />
          )}
          <button
            disabled={!chosen.length || !attribute}
            onClick={() =>
              setBulkReview({
                employeeIds: [...chosen],
                attributeId: attribute,
                value: bulk,
              })
            }
          >
            {t("Apply to selected employees")}
          </button>
          <Text
            label={t("Future effective date")}
            type="date"
            value={from}
            onChange={setFrom}
          />
          <button
            disabled={
              !chosen.length ||
              !attribute ||
              (!!s.history.through && from <= s.history.through)
            }
            onClick={() =>
              setBulkReview({
                employeeIds: [...chosen],
                attributeId: attribute,
                value: bulk,
                from,
              })
            }
          >
            {t("Schedule future change")}
          </button>
        </div>
      </section>
      <section className="panel">
        <h3>{t("Employment and dated arrangements")}</h3>
        {s.employees.map((e, i) => (
          <Card key={e.id} title={e.label}>
            <div className="row">
              <Text
                label={t("Employed from")}
                type="date"
                value={e.employment?.validFrom || ""}
                onChange={(x) =>
                  update((d) => {
                    if (x)
                      d.employees[i].employment = {
                        ...d.employees[i].employment,
                        validFrom: x,
                      };
                    else delete d.employees[i].employment;
                  })
                }
              />
              <Text
                label={t("Employed until (exclusive)")}
                type="date"
                value={e.employment?.validTo || ""}
                onChange={(x) =>
                  update((d) => {
                    if (x)
                      d.employees[i].employment = {
                        validFrom:
                          d.employees[i].employment?.validFrom ||
                          d.calendar.start,
                        validTo: x,
                      };
                    else if (d.employees[i].employment)
                      delete d.employees[i].employment!.validTo;
                  })
                }
              />
              <PatternChoice
                s={s}
                value={e.workPatternId}
                onChange={(x) =>
                  update((d) => {
                    if (typeof x === "string") d.employees[i].workPatternId = x;
                    else delete d.employees[i].workPatternId;
                  })
                }
              />
              <AssignmentOrigin
                s={s}
                value={
                  assignmentPreview?.workforce?.employees.find(
                    (person) => person.employeeId === e.id,
                  )?.workPatternAssignment
                }
              />
            </div>
            <details>
              <summary>{t("Typed attributes and defaults")}</summary>
              <Values
                s={s}
                value={e.attributes}
                onChange={(x) =>
                  update((d) => {
                    d.employees[i].attributes = x;
                  })
                }
              />
            </details>
            {(e.versions || []).map((v, j) => (
              <details key={j} className="item-card">
                <summary>
                  {t("Effective from {date}", { date: v.validFrom })}
                </summary>
                <div className="row">
                  <Text
                    label={t("Valid from")}
                    type="date"
                    value={v.validFrom}
                    onChange={(x) =>
                      update((d) => {
                        d.employees[i].versions![j].validFrom = x;
                      })
                    }
                  />
                  <Text
                    label={t("Valid until (exclusive)")}
                    type="date"
                    value={v.validTo || ""}
                    onChange={(x) =>
                      update((d) => {
                        if (x) d.employees[i].versions![j].validTo = x;
                        else delete d.employees[i].versions![j].validTo;
                      })
                    }
                  />
                  <Select
                    createKind="employeeType"
                    label={t("Employee type override")}
                    value={v.typeId || ""}
                    options={[
                      { id: "", label: t("Use base value") },
                      ...s.employeeTypes,
                    ]}
                    onChange={(x) =>
                      update((d) => {
                        if (x) d.employees[i].versions![j].typeId = x;
                        else delete d.employees[i].versions![j].typeId;
                      })
                    }
                  />
                  <PatternChoice
                    s={s}
                    temporal
                    value={v.workPatternId}
                    onChange={(x) =>
                      update((d) => {
                        if (x === null) enableAssignmentRules(d);
                        if (x !== undefined)
                          d.employees[i].versions![j].workPatternId = x;
                        else delete d.employees[i].versions![j].workPatternId;
                      })
                    }
                  />

                  <button
                    onClick={() =>
                      update((d) => {
                        d.employees[i].versions!.splice(j, 1);
                      })
                    }
                  >
                    {t("Remove version")}
                  </button>
                </div>
                <Values
                  s={s}
                  value={v.attributes || {}}
                  onChange={(x) =>
                    update((d) => {
                      d.employees[i].versions![j].attributes = x;
                    })
                  }
                />
              </details>
            ))}
            <Text
              label={t("Future effective date")}
              type="date"
              value={from}
              onChange={setFrom}
            />
            <button
              disabled={!!s.history.through && from <= s.history.through}
              onClick={() =>
                update((d) =>
                  scheduleVersion(d.employees[i], {
                    validFrom: from,
                    attributes: {},
                  }),
                )
              }
            >
              {t("Add dated version")}
            </button>
          </Card>
        ))}
      </section>
      <section className="panel">
        <h3>{t("Workforce at a date")}</h3>
        <div className="row">
          <Text
            label={t("Preview date")}
            type="date"
            value={previewDate}
            onChange={setPreviewDate}
          />
          <button
            onClick={async () => {
              try {
                setPreview(
                  await coreAction("inspect", s, { onDate: previewDate }),
                );
                setError("");
              } catch (e) {
                setError(localizeError((e as Error).message));
              }
            }}
          >
            {t("Preview workforce and hours")}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {preview?.diagnostics.map((d, i) => (
          <p className="error" key={i}>
            {diagnostic(d)}
          </p>
        ))}
        {preview?.workforce && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Employee")}</th>
                  <th>{t("Active")}</th>
                  <th>{t("Attributes")}</th>
                  <th>{t("Effective hours")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.workforce.employees.map((e) => (
                  <tr key={e.employeeId}>
                    <th scope="row">{e.label}</th>
                    <td>{e.active ? t("Yes") : t("No")}</td>
                    <td>
                      {Object.entries(e.attributes).map(([key, v]) => (
                        <div key={key}>
                          {definitions.find((a) => a.id === key)?.label || key}:{" "}
                          {v.value === undefined
                            ? t("Missing")
                            : String(v.value)}{" "}
                          ({t(v.origin)})
                        </div>
                      ))}
                    </td>
                    <td>
                      {e.shifts
                        .filter((x) => x.admissible)
                        .map((x, i) => (
                          <div key={i}>
                            {s.shifts.find((sh) => sh.id === x.shiftId)?.label}:{" "}
                            {x.intervals
                              .map(
                                (i) =>
                                  `${i.start}–${i.end}${i.endDayOffset ? " +1" : ""}`,
                              )
                              .join(", ") || t("Scheduled rest")}
                          </div>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
export function WorkPatterns({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  return (
    <>
      <EntityHeader title={t("Contracts & work patterns")} />
      <p className="intro">
        {t(
          "Attributes describe people. Only explicitly configured work patterns restrict working days and shifts.",
        )}
      </p>
      {(s.workPatterns || []).map((p, i) => (
        <Card
          key={p.id}
          title={p.label}
          remove={() =>
            update((d) => {
              d.workPatterns!.splice(i, 1);
            })
          }
          duplicate={() =>
            update((d) => {
              d.workPatterns!.push({
                ...structuredClone(p),
                id: id("pattern"),
                label: p.label + " " + t("Copy"),
              });
            })
          }
        >
          <Text
            label={t("Work pattern label")}
            value={p.label}
            onChange={(x) =>
              update((d) => {
                d.workPatterns![i].label = x;
              })
            }
          />
          {p.versions.map((v, j) => (
            <div className="item-card" key={j}>
              <div className="row">
                <Text
                  label={t("Valid from")}
                  type="date"
                  value={v.validFrom}
                  onChange={(x) =>
                    update((d) => {
                      d.workPatterns![i].versions[j].validFrom = x;
                    })
                  }
                />
                <Text
                  label={t("Valid until (exclusive)")}
                  type="date"
                  value={v.validTo || ""}
                  onChange={(x) =>
                    update((d) => {
                      if (x) d.workPatterns![i].versions[j].validTo = x;
                      else delete d.workPatterns![i].versions[j].validTo;
                    })
                  }
                />
                <button
                  onClick={() =>
                    update((d) => {
                      d.workPatterns![i].versions.splice(j, 1);
                    })
                  }
                >
                  {t("Remove version")}
                </button>
              </div>
              <Multi
                label={t("Allowed weekdays")}
                values={v.weekdays.map(String)}
                options={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (label, i) => ({ id: String(i + 1), label: t(label) }),
                )}
                onChange={(x) =>
                  update((d) => {
                    d.workPatterns![i].versions[j].weekdays = x.map(Number);
                  })
                }
              />
              <Multi
                createKind="shift"
                label={t("Permitted shifts")}
                values={v.shiftIds}
                options={s.shifts}
                onChange={(x) =>
                  update((d) => {
                    d.workPatterns![i].versions[j].shiftIds = x;
                  })
                }
              />
              <h4>{t("Date exceptions")}</h4>
              {(v.exceptions || []).map((x, k) => (
                <div className="item-card" key={k}>
                  <Text
                    label={t("Date")}
                    type="date"
                    value={x.date}
                    onChange={(val) =>
                      update((d) => {
                        d.workPatterns![i].versions[j].exceptions![k].date =
                          val;
                      })
                    }
                  />
                  <Multi
                    createKind="shift"
                    label={t("Permitted shifts")}
                    values={x.shiftIds}
                    options={s.shifts}
                    onChange={(val) =>
                      update((d) => {
                        d.workPatterns![i].versions[j].exceptions![k].shiftIds =
                          val;
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      update((d) => {
                        d.workPatterns![i].versions[j].exceptions!.splice(k, 1);
                      })
                    }
                  >
                    {t("Remove exception")}
                  </button>
                </div>
              ))}
              <AddRow
                label={t("Add date exception")}
                onAdd={() =>
                  update((d) => {
                    (d.workPatterns![i].versions[j].exceptions ??= []).push({
                      date: d.calendar.start,
                      shiftIds: [],
                    });
                  })
                }
              />
            </div>
          ))}
          <AddRow
            label={t("Add pattern version")}
            onAdd={() =>
              update((d) => {
                d.workPatterns![i].versions.push({
                  validFrom: d.calendar.start,
                  weekdays: [1, 2, 3, 4, 5],
                  shiftIds: d.shifts.map((x) => x.id),
                  exceptions: [],
                });
              })
            }
          />
        </Card>
      ))}
      <AddRow
        label={t("Create work pattern")}
        onAdd={() =>
          update((d) => {
            initializeEvolution(d);
            d.workPatterns!.push({
              id: id("pattern"),
              label: t("New work pattern"),
              versions: [
                {
                  validFrom: d.calendar.start,
                  weekdays: [1, 2, 3, 4, 5],
                  shiftIds: d.shifts.map((x) => x.id),
                  exceptions: [],
                },
              ],
            });
          })
        }
      />
    </>
  );
}
export function Variants({ s, update }: { s: Scenario; update: Update }) {
  const { t } = useI18n();
  const [tag, setTag] = useState("");
  return (
    <section className="panel">
      <h3>{t("Logical shifts, variants and fairness categories")}</h3>
      <p className="hint">
        {t(
          "When variants exist, base intervals are no longer a fallback. Highest priority wins; equal-priority matches are errors.",
        )}
      </p>
      {s.shifts.map((shift, i) => (
        <Card
          key={shift.id}
          title={shift.label}
          duplicate={() =>
            update((d) => {
              d.shifts.push({
                ...structuredClone(shift),
                id: id("shift"),
                label: shift.label + " " + t("Copy"),
              });
            })
          }
        >
          <div className="row">
            <Text
              label={t("Fairness category")}
              value={tag}
              onChange={setTag}
            />
            <button
              disabled={!tag}
              onClick={() =>
                update((d) => {
                  const tags = (d.shifts[i].fairnessTags ??= []);
                  if (!tags.includes(tag)) tags.push(tag);
                  d.shifts[i].fairnessTags = tags;
                  setTag("");
                })
              }
            >
              {t("Add category")}
            </button>
          </div>
          <div className="chips">
            {(shift.fairnessTags || []).map((x) => (
              <span className="chip" key={x}>
                {x}
                <button
                  onClick={() =>
                    update((d) => {
                      d.shifts[i].fairnessTags = d.shifts[
                        i
                      ].fairnessTags!.filter((v) => v !== x);
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {(shift.variants || []).map((v, j) => (
            <Card
              key={v.id}
              title={v.label}
              remove={() =>
                update((d) => {
                  d.shifts[i].variants!.splice(j, 1);
                })
              }
              duplicate={() =>
                update((d) => {
                  d.shifts[i].variants!.push({
                    ...structuredClone(v),
                    id: id("variant"),
                    priority:
                      Math.max(
                        ...d.shifts[i].variants!.map((x) => x.priority),
                      ) + 1,
                    label: v.label + " " + t("Copy"),
                  });
                })
              }
            >
              <div className="row">
                <Text
                  label={t("Variant label")}
                  value={v.label}
                  onChange={(x) =>
                    update((d) => {
                      d.shifts[i].variants![j].label = x;
                    })
                  }
                />
                <Text
                  label={t("Variant priority (highest first)")}
                  type="number"
                  value={v.priority}
                  onChange={(x) =>
                    update((d) => {
                      d.shifts[i].variants![j].priority = Number(x);
                    })
                  }
                />
              </div>
              <SelectorEditor
                s={s}
                value={v.selector}
                onChange={(x) =>
                  update((d) => {
                    d.shifts[i].variants![j].selector = x;
                  })
                }
              />
              <ScopeEditor
                s={s}
                value={v.scope}
                onChange={(x) =>
                  update((d) => {
                    d.shifts[i].variants![j].scope = x;
                  })
                }
              />
              <Multi
                createKind="pattern"
                label={t("Work patterns (empty means all)")}
                options={s.workPatterns || []}
                values={v.workPatternIds || []}
                onChange={(x) =>
                  update((d) => {
                    if (x.length) d.shifts[i].variants![j].workPatternIds = x;
                    else delete d.shifts[i].variants![j].workPatternIds;
                  })
                }
              />
              <VariantApplicability s={s} shiftId={shift.id} variantId={v.id} />
              <IntervalEditor
                value={v.intervals}
                onChange={(x) =>
                  update((d) => {
                    d.shifts[i].variants![j].intervals = x;
                  })
                }
              />
            </Card>
          ))}
          {shift.kind === "WORKING" && (
            <AddRow
              label={t("Add concrete variant")}
              onAdd={() =>
                update((d) => {
                  initializeEvolution(d);
                  const variants = (d.shifts[i].variants ??= []);
                  variants.push({
                    id: id("variant"),
                    label: t("New variant"),
                    priority: variants.length
                      ? Math.max(...variants.map((x) => x.priority)) + 1
                      : 0,
                    selector: {},
                    scope: {},
                    intervals: structuredClone(
                      shift.intervals.length
                        ? shift.intervals
                        : [{ start: "09:00", end: "17:00", endDayOffset: 0 }],
                    ),
                  });
                  d.shifts[i].variants = variants;
                })
              }
            />
          )}
        </Card>
      ))}
    </section>
  );
}

export function RegenerationControl({
  s,
  previousScenario,
  previousResult,
  run,
}: {
  s: Scenario;
  previousScenario: Scenario;
  previousResult: Result;
  run: (
    action: string,
    extra?: Record<string, unknown>,
  ) => Promise<Result | undefined>;
}) {
  const { t } = useI18n();
  const [from, setFrom] = useState(s.calendar.start),
    [priority, setPriority] = useState("BEFORE_FAIRNESS");
  return (
    <section className="panel regeneration">
      <h3>{t("Regenerate after an operational change")}</h3>
      <p className="hint">
        {t(
          "Dates before the effective date stay frozen. Published locks and consolidated history are preserved. Fallback minimization still precedes stability and fairness.",
        )}
      </p>
      <div className="row">
        <Text
          label={t("Regenerate from")}
          type="date"
          value={from}
          onChange={setFrom}
        />
        <Select
          label={t("Schedule stability priority")}
          value={priority}
          options={[
            {
              id: "BEFORE_FAIRNESS",
              label: t("Minimize changes before fairness"),
            },
            {
              id: "AFTER_FAIRNESS",
              label: t("Optimize fairness before minimizing changes"),
            },
          ]}
          onChange={setPriority}
        />
        <button
          className="primary"
          onClick={() =>
            run("regenerate", {
              document: {
                from,
                previousScenario,
                previousResult,
                stabilityPriority: priority,
              },
            })
          }
        >
          {t("Regenerate from this date")}
        </button>
      </div>
    </section>
  );
}
export function CatalogueUsage({
  s,
  onNavigate,
}: {
  s: Scenario;
  onNavigate: (key: string) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState("");
  const items = [
    ...s.employeeTypes.map((x) => ({
      ...x,
      section: "people",
      kind: "Employee type",
    })),
    ...s.groups.map((x) => ({ ...x, section: "people", kind: "Group" })),
    ...(s.attributeDefinitions || []).map((x) => ({
      ...x,
      section: "people",
      kind: "Attribute",
    })),
    ...(s.workPatterns || []).map((x) => ({
      ...x,
      section: "contracts",
      kind: "Work pattern",
    })),
    ...s.shifts.map((x) => ({ ...x, section: "shifts", kind: "Shift" })),
    ...(s.weekProfiles || []).map((x) => ({
      ...x,
      section: "weeks",
      kind: "Week profile",
    })),
  ];
  const item = items.find((x) => x.kind + ":" + x.id === selected);
  const refs: string[] = [];
  function walk(value: unknown, path: string) {
    if (Array.isArray(value)) value.forEach((x, i) => walk(x, path + "/" + i));
    else if (value && typeof value === "object")
      for (const [key, v] of Object.entries(value))
        if (key !== "id") walk(v, path + "/" + key);
        else {
        }
    else if (value === item?.id) refs.push(path);
  }
  if (item) walk(s, "");
  const section = (path: string) =>
    path.startsWith("/workPatterns")
      ? "contracts"
      : path.startsWith("/week")
        ? "weeks"
        : path.startsWith("/shifts")
          ? "shifts"
          : path.startsWith("/duty") || path.startsWith("/temporal")
            ? "coverage"
            : path.startsWith("/policies")
              ? "policies"
              : path.startsWith("/calendar") || path.startsWith("/availability")
                ? "calendar"
                : "people";
  return (
    <section className="panel">
      <h3>{t("Catalogue reuse and dependencies")}</h3>
      <Select
        label={t("Inspect references to")}
        value={selected}
        options={[
          { id: "", label: t("Choose a catalogue item") },
          ...items.map((x) => ({
            id: x.kind + ":" + x.id,
            label: t(x.kind) + " · " + x.label,
          })),
        ]}
        onChange={setSelected}
      />
      {item && (
        <>
          <p className="hint">
            {refs.length
              ? t("Explicit references: {count}", { count: refs.length })
              : t(
                  "No explicit references. Broad selectors may still include this item.",
                )}
          </p>
          {refs.map((path) => (
            <button
              className="reference-link"
              key={path}
              onClick={() => onNavigate(section(path))}
            >
              {path}
            </button>
          ))}
        </>
      )}
    </section>
  );
}
