import { PredicateEditor } from "./evolution";
import { useCatalogue, type CatalogueKind } from "./catalogue-context";
import { coreAction } from "./api";
import { useI18n } from "./i18n";
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
  const { t } = useI18n();
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
  const { t } = useI18n();
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
  createKind,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
  createKind?: CatalogueKind;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const create = useCatalogue();
  const shown = options.filter(
    (x) =>
      x.id === value ||
      !query ||
      `${x.label} ${x.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Field label={label}>
      <span className="catalogue-select">
        {options.length > 8 && (
          <input
            aria-label={t("Search {catalogue}", { catalogue: label })}
            type="search"
            placeholder={t("Search catalogue…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {shown.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        {createKind && create && (
          <button
            type="button"
            className="catalogue-create"
            onClick={() => create(createKind)}
          >
            {t("Create here")}
          </button>
        )}
      </span>
    </Field>
  );
}
export function Multi({
  label,
  values,
  options,
  onChange,
  createKind,
}: {
  label: string;
  values: string[];
  options: { id: string; label: string }[];
  onChange: (v: string[]) => void;
  createKind?: CatalogueKind;
}) {
  const { t } = useI18n();
  const create = useCatalogue();
  const [query, setQuery] = useState("");
  const shown = options.filter(
    (x) =>
      !query ||
      `${x.label} ${x.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <fieldset className="multi">
      <legend>{label}</legend>
      {options.length > 8 && (
        <input
          type="search"
          aria-label={t("Search {catalogue}", { catalogue: label })}
          placeholder={t("Search catalogue…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}{" "}
      {shown.length ? (
        shown.map((x) => (
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
        <small>{t("No items yet")}</small>
      )}
      {createKind && create && (
        <button type="button" onClick={() => create(createKind)}>
          {t("Create here")}
        </button>
      )}
    </fieldset>
  );
}
export function ScopeEditor({
  s,
  value,
  onChange,
}: {
  s?: Scenario;
  value: Scope;
  onChange: (v: Scope) => void;
}) {
  const { t } = useI18n();
  return (
    <details className="scope">
      <summary>{t("When this rule applies")}</summary>
      <div className="row">
        <Text
          label={t("From (optional)")}
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
          label={t("Until (optional)")}
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
            {t(label)}
          </label>
        ))}
      </div>
      {!!s?.weekProfiles?.length && (
        <Multi
          label={t("Applicable week profiles (empty means all)")}
          options={s.weekProfiles}
          values={value.weekProfileIds || []}
          onChange={(ids) => {
            const next = { ...value };
            if (ids.length) next.weekProfileIds = ids;
            else delete next.weekProfileIds;
            onChange(next);
          }}
        />
      )}
      {s?.calendar.holidays && (
        <Select
          label={t("Day classification")}
          value={value.dayType || "ANY"}
          options={[
            { id: "ANY", label: t("All dates") },
            { id: "HOLIDAY", label: t("Holidays only") },
            { id: "NON_HOLIDAY", label: t("Non-holidays only") },
          ]}
          onChange={(dayType) =>
            onChange({ ...value, dayType: dayType as Scope["dayType"] })
          }
        />
      )}
      <DateList
        label={t("Dates excluded from this rule")}
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
  const { t, diagnostic, localizeError } = useI18n();
  const createCatalogue = useCatalogue();
  const [previewDate, setPreviewDate] = useState(s.calendar.start),
    [previewNames, setPreviewNames] = useState<string[]>(),
    [previewError, setPreviewError] = useState("");
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
        {t("Participants")}{" "}
        <span className="muted">
          {Object.keys(value).length
            ? Object.entries(value)
                .filter(([, v]) => Array.isArray(v))
                .map(([, v]) => (v as string[]).join(", "))
                .join(" · ") || t("By attributes")
            : t("All employees")}
        </span>
      </summary>
      <p className="hint">
        {t(
          "Choices within a category are combined by union; categories intersect. Leave all categories empty to select everyone.",
        )}{" "}
      </p>
      <div className="selector-grid">
        <Multi
          label={t("Employee types")}
          options={s.employeeTypes}
          values={value.typeIds || []}
          onChange={(v) => set("typeIds", v)}
        />
        <Multi
          label={t("Groups")}
          options={s.groups.filter((g) => g.id !== excludeGroup)}
          values={value.groupIds || []}
          onChange={(v) => set("groupIds", v)}
        />
        <Multi
          label={t("Employees")}
          options={s.employees}
          values={value.employeeIds || []}
          onChange={(v) => set("employeeIds", v)}
        />
      </div>
      {!!s.attributeDefinitions?.length && (
        <>
          <h4>{t("Typed attribute conditions")}</h4>
          {value.where ? (
            <>
              <PredicateEditor
                s={s}
                value={value.where}
                onChange={(where) => onChange({ ...value, where })}
              />
              <button
                onClick={() => {
                  const next = { ...value };
                  delete next.where;
                  onChange(next);
                }}
              >
                {t("Remove attribute condition")}
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                const a = s.attributeDefinitions![0];
                onChange({
                  ...value,
                  where: { op: "EXISTS", attributeId: a.id },
                });
              }}
            >
              {t("Add attribute condition")}
            </button>
          )}
        </>
      )}
      {createCatalogue && (
        <button onClick={() => createCatalogue("attribute")}>
          {t("Create reusable attribute here")}
        </button>
      )}
      <div className="row">
        <Text
          label={t("Selector preview date")}
          type="date"
          value={previewDate}
          onChange={setPreviewDate}
        />
        <button
          onClick={async () => {
            try {
              const r = await coreAction("select", s, {
                selector: value,
                onDate: previewDate,
              });
              if (r.status === "INSPECTED") {
                setPreviewNames(
                  (r.workforce?.selectedEmployeeIds || []).map(
                    (id) => s.employees.find((e) => e.id === id)?.label || id,
                  ),
                );
                setPreviewError("");
              } else
                setPreviewError(
                  r.diagnostics.map((d) => diagnostic(d)).join(" · "),
                );
            } catch (e) {
              setPreviewError(localizeError((e as Error).message));
            }
          }}
        >
          {t("Preview matching employees")}
        </button>
      </div>
      {previewNames && (
        <p className="hint">
          {t("Matching employees: {count}", { count: previewNames.length })} ·{" "}
          {previewNames.join(", ")}
        </p>
      )}
      {previewError && <p className="error">{previewError}</p>}
      <AttributeEditor
        value={value.attributes || {}}
        onChange={(attributes) => {
          const next = { ...value };
          if (Object.keys(attributes).length)
            next.attributes = Object.fromEntries(
              Object.entries(attributes).filter(
                (entry): entry is [string, string | number | boolean] =>
                  entry[1] !== null,
              ),
            );
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
  value: Record<string, string | number | boolean | null>;
  onChange: (v: Record<string, string | number | boolean | null>) => void;
  keyValue?: string;
  setKey?: (v: string) => void;
  textValue?: string;
  setText?: (v: string) => void;
}) {
  const { t } = useI18n();
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
            aria-label={t("Remove attribute {key}", { key: k })}
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
          aria-label={t("Attribute key")}
          placeholder={t("Attribute key")}
          value={key}
          onChange={(e) => setK(e.target.value)}
        />
        <input
          aria-label={t("Attribute value")}
          placeholder={t("Value")}
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
          {t("Add attribute")}{" "}
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
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  return (
    <div className="date-list">
      <h4>{label}</h4>
      <div className="chips">
        {value.map((d, i) => (
          <span className="chip" key={i}>
            {d}
            <button
              aria-label={t("Remove {value}", { value: d })}
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
          {t("Add")}{" "}
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
  const { t } = useI18n();
  const group = value.op === "AND" || value.op === "OR";
  return (
    <div className={`expression ${group ? "branch" : "atom"}`}>
      <div className="expression-head">
        <select
          aria-label={t("Expression operator")}
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
          <option value="COUNT">{t("Staffing count")}</option>
          <option value="REMAINING">{t("The remaining employees")}</option>
          <option value="AND">{t("AND · every condition")}</option>
          <option value="OR">{t("OR · at least one branch")}</option>
        </select>
        {group && (
          <span className="badge">
            {t("{count} conditions", { count: value.children.length })}
          </span>
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
              {t("+ Condition")}{" "}
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
              {t("+ AND group")}{" "}
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
              {t("+ OR group")}{" "}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            {value.op === "COUNT" && (
              <>
                <Select
                  label={t("Cardinality")}
                  value={value.comparison}
                  options={[
                    { id: "EQ", label: t("Exactly") },
                    { id: "GE", label: t("At least") },
                    { id: "LE", label: t("At most") },
                  ]}
                  onChange={(comparison) =>
                    onChange({
                      ...value,
                      comparison: comparison as "EQ" | "GE" | "LE",
                    })
                  }
                />
                <Text
                  label={t("People")}
                  type="number"
                  value={value.count}
                  onChange={(v) => onChange({ ...value, count: Number(v) })}
                />
              </>
            )}
            <Select
              label={t("Assigned shift")}
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
              {t(
                "Place in a flat AND branch with COUNT siblings using the identical selector. This limits the remaining shift choices; “at least” keeps its meaning.",
              )}{" "}
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
  const { t } = useI18n();
  return (
    <article className="constraint-card">
      <div className="row">
        <Text
          label={t("Rule ID")}
          value={value.id}
          onChange={(v) => onChange({ ...value, id: v })}
        />
        <Text
          label={t("Rule label")}
          value={value.label || ""}
          onChange={(v) => onChange({ ...value, label: v })}
        />
        <button className="danger" onClick={onRemove}>
          {t("Remove rule")}{" "}
        </button>
      </div>
      <ExpressionEditor
        s={s}
        value={value.expression}
        onChange={(expression) => onChange({ ...value, expression })}
      />
      <ScopeEditor
        s={s}
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
  const { t } = useI18n();
  return (
    <button className="add-row" aria-label={t(label)} onClick={onAdd}>
      ＋ {t(label)}
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
  const { t } = useI18n();
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export { id };
