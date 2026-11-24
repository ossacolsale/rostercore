import { useI18n } from "./i18n";
import { useEffect, useState, type ReactNode } from "react";
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [options.length]);
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
          {!options.some((x) => x.id === value) && (
            <option value={value}>
              {value
                ? t("Missing reference: {id}", { id: value })
                : t("Choose an item")}
            </option>
          )}
          {shown.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </span>
    </Field>
  );
}
export function Multi({
  label,
  values,
  options,
  onChange,
  showIdentifiers = true,
}: {
  label: string;
  values: string[];
  options: { id: string; label: string }[];
  onChange: (v: string[]) => void;
  showIdentifiers?: boolean;
}) {
  const { t } = useI18n();
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
            {showIdentifiers && <small>{x.id}</small>}
          </label>
        ))
      ) : (
        <small>{t("No items yet")}</small>
      )}
    </fieldset>
  );
}
