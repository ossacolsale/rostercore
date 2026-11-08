import { useState, type ReactNode } from "react";
import {
  type Scenario,
  type Selector,
  type Scope,
  type Expression,
  type Constraint,
  newAtom,
  id,
} from "./model";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Text({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Multi({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: { id: string; label: string }[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="multi">
      <legend>{label}</legend>
      {options.length ? (
        options.map((x) => (
          <label key={x.id}>
            <input
              type="checkbox"
              checked={values.includes(x.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...values, x.id]
                    : values.filter((v) => v !== x.id),
                )
              }
            />
            {x.label}
            <small>{x.id}</small>
          </label>
        ))
      ) : (
        <small>No items yet</small>
      )}
    </fieldset>
  );
}
export function ScopeEditor({
  value,
  onChange,
}: {
  value: Scope;
  onChange: (v: Scope) => void;
}) {
  return (
    <details className="scope">
      <summary>When this rule applies</summary>
      <div className="row">
        <Text
          label="From (optional)"
          type="date"
          value={value.start || ""}
          onChange={(v) => {
            const next = { ...value };
            if (v) next.start = v;
            else delete next.start;
            onChange(next);
          }}
        />
        <Text
          label="Until (optional)"
          type="date"
          value={value.end || ""}
          onChange={(v) => {
            const next = { ...value };
            if (v) next.end = v;
            else delete next.end;
            onChange(next);
          }}
        />
      </div>
      <div className="weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => (
          <label key={label}>
            <input
              type="checkbox"
              checked={!value.weekdays || value.weekdays.includes(i + 1)}
              onChange={(e) => {
                const days = value.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
                onChange({
                  ...value,
                  weekdays: e.target.checked
                    ? [...days, i + 1]
                    : days.filter((x) => x !== i + 1),
                });
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <DateList
        label="Dates excluded from this rule"
        value={value.excludedDates || []}
        onChange={(v) => onChange({ ...value, excludedDates: v })}
      />
    </details>
  );
}
export function SelectorEditor({
  s,
  value,
  onChange,
  excludeGroup,
}: {
  s: Scenario;
  value: Selector;
  onChange: (v: Selector) => void;
  excludeGroup?: string;
}) {
  const [key, setKey] = useState(""),
    [val, setVal] = useState("");
  const set = (k: "employeeIds" | "typeIds" | "groupIds", v: string[]) => {
    const next = { ...value };
    if (v.length) next[k] = v;
    else delete next[k];
    onChange(next);
  };
  return (
    <details className="selector">
      <summary>
        Participants{" "}
        <span className="muted">
          {Object.keys(value).length
            ? Object.entries(value)
                .filter(([k]) => k !== "attributes")
                .map(([, v]) => (v as string[]).join(", "))
                .join(" · ") || "By attributes"
            : "All employees"}
        </span>
      </summary>
      <p className="hint">
        Choices within a category are combined by union; categories intersect.
        Leave all categories empty to select everyone.
      </p>
      <div className="selector-grid">
        <Multi
          label="Employee types"
          options={s.employeeTypes}
          values={value.typeIds || []}
          onChange={(v) => set("typeIds", v)}
        />
        <Multi
          label="Groups"
          options={s.groups.filter((g) => g.id !== excludeGroup)}
          values={value.groupIds || []}
          onChange={(v) => set("groupIds", v)}
        />
        <Multi
          label="Employees"
          options={s.employees}
          values={value.employeeIds || []}
          onChange={(v) => set("employeeIds", v)}
        />
      </div>
      <AttributeEditor
        value={value.attributes || {}}
        onChange={(attributes) => {
          const next = { ...value };
          if (Object.keys(attributes).length) next.attributes = attributes;
          else delete next.attributes;
          onChange(next);
        }}
        keyValue={key}
        setKey={setKey}
        textValue={val}
        setText={setVal}
      />
    </details>
  );
}
export function AttributeEditor({
  value,
  onChange,
  keyValue,
  setKey,
  textValue,
  setText,
}: {
  value: Record<string, string | number | boolean>;
  onChange: (v: Record<string, string | number | boolean>) => void;
  keyValue?: string;
  setKey?: (v: string) => void;
  textValue?: string;
  setText?: (v: string) => void;
}) {
  const [ownKey, setOwnKey] = useState(""),
    [ownVal, setOwnVal] = useState("");
  const key = keyValue ?? ownKey,
    val = textValue ?? ownVal,
    setK = setKey ?? setOwnKey,
    setV = setText ?? setOwnVal;
  const parse = (v: string): string | number | boolean =>
    v === "true"
      ? true
      : v === "false"
        ? false
        : v.trim() !== "" && Number.isFinite(Number(v))
          ? Number(v)
          : v;
  return (
    <div className="attributes">
      {Object.entries(value).map(([k, v]) => (
        <span className="chip" key={k}>
          {k}: {String(v)}{" "}
          <button
            aria-label={`Remove attribute ${k}`}
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <div className="row">
        <input
          aria-label="Attribute key"
          placeholder="Attribute key"
          value={key}
          onChange={(e) => setK(e.target.value)}
        />
        <input
          aria-label="Attribute value"
          placeholder="Value"
          value={val}
          onChange={(e) => setV(e.target.value)}
        />
        <button
          disabled={!key}
          onClick={() => {
            onChange({ ...value, [key]: parse(val) });
            setK("");
            setV("");
          }}
        >
          Add attribute
        </button>
      </div>
    </div>
  );
}
export function DateList({
  label,
  value,
  onChange,
  type = "date",
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  type?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="date-list">
      <h4>{label}</h4>
      <div className="chips">
        {value.map((d, i) => (
          <span className="chip" key={i}>
            {d}
            <button
              aria-label={`Remove ${d}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row">
        <input
          aria-label={label}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          disabled={!draft}
          onClick={() => {
            if (!value.includes(draft)) onChange([...value, draft]);
            setDraft("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
export function ExpressionEditor({
  s,
  value,
  onChange,
  depth = 0,
}: {
  s: Scenario;
  value: Expression;
  onChange: (v: Expression) => void;
  depth?: number;
}) {
  const group = value.op === "AND" || value.op === "OR";
  return (
    <div className={`expression ${group ? "branch" : "atom"}`}>
      <div className="expression-head">
        <select
          aria-label="Expression operator"
          value={value.op}
          onChange={(e) => {
            const op = e.target.value as Expression["op"];
            if (op === "AND" || op === "OR")
              onChange({ op, children: [value] });
            else if (op === "COUNT") onChange(newAtom(s));
            else
              onChange({
                op: "REMAINING",
                selector: {},
                shiftId:
                  s.shifts.find((x) => x.kind === "OFF")?.id ||
                  s.shifts[0]?.id ||
                  "",
              });
          }}
        >
          <option value="COUNT">Staffing count</option>
          <option value="REMAINING">The remaining employees</option>
          <option value="AND">AND · every condition</option>
          <option value="OR">OR · at least one branch</option>
        </select>
        {group && (
          <span className="badge">{value.children.length} conditions</span>
        )}
      </div>
      {group ? (
        <>
          <div className="children">
            {value.children.map((child, i) => (
              <div className="child" key={i}>
                <ExpressionEditor
                  s={s}
                  value={child}
                  depth={depth + 1}
                  onChange={(v) =>
                    onChange({
                      ...value,
                      children: value.children.map((c, j) => (i === j ? v : c)),
                    })
                  }
                />
                <button
                  className="remove subtle"
                  aria-label="Remove condition"
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
          </div>
          <div className="row">
            <button
              onClick={() =>
                onChange({
                  ...value,
                  children: [...value.children, newAtom(s)],
                })
              }
            >
              + Condition
            </button>
            <button
              onClick={() =>
                onChange({
                  ...value,
                  children: [
                    ...value.children,
                    { op: "AND", children: [newAtom(s)] },
                  ],
                })
              }
            >
              + AND group
            </button>
            <button
              onClick={() =>
                onChange({
                  ...value,
                  children: [
                    ...value.children,
                    { op: "OR", children: [newAtom(s)] },
                  ],
                })
              }
            >
              + OR group
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            {value.op === "COUNT" && (
              <>
                <Select
                  label="Cardinality"
                  value={value.comparison}
                  options={[
                    { id: "EQ", label: "Exactly" },
                    { id: "GE", label: "At least" },
                    { id: "LE", label: "At most" },
                  ]}
                  onChange={(comparison) =>
                    onChange({
                      ...value,
                      comparison: comparison as "EQ" | "GE" | "LE",
                    })
                  }
                />
                <Text
                  label="People"
                  type="number"
                  value={value.count}
                  onChange={(v) => onChange({ ...value, count: Number(v) })}
                />
              </>
            )}
            <Select
              label="Assigned shift"
              value={value.shiftId}
              options={s.shifts}
              onChange={(shiftId) => onChange({ ...value, shiftId })}
            />
          </div>
          <SelectorEditor
            s={s}
            value={value.selector}
            onChange={(selector) => onChange({ ...value, selector })}
          />
          {value.op === "REMAINING" && (
            <p className="hint">
              Place in a flat AND branch with COUNT siblings using the identical
              selector. This limits the remaining shift choices; “at least”
              keeps its meaning.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function ConstraintEditor({
  s,
  value,
  onChange,
  onRemove,
}: {
  s: Scenario;
  value: Constraint;
  onChange: (v: Constraint) => void;
  onRemove: () => void;
}) {
  return (
    <article className="constraint-card">
      <div className="row">
        <Text
          label="Rule ID"
          value={value.id}
          onChange={(v) => onChange({ ...value, id: v })}
        />
        <Text
          label="Rule label"
          value={value.label || ""}
          onChange={(v) => onChange({ ...value, label: v })}
        />
        <button className="danger" onClick={onRemove}>
          Remove rule
        </button>
      </div>
      <ExpressionEditor
        s={s}
        value={value.expression}
        onChange={(expression) => onChange({ ...value, expression })}
      />
      <ScopeEditor
        value={value.scope || {}}
        onChange={(scope) => onChange({ ...value, scope })}
      />
    </article>
  );
}
export function AddRow({
  onAdd,
  label = "Add item",
}: {
  onAdd: () => void;
  label?: string;
}) {
  return (
    <button className="add-row" aria-label={label} onClick={onAdd}>
      ＋ {label}
    </button>
  );
}
export function EntityHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export { id };
