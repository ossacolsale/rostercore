import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Scenario, Result } from "./model";
import type { Update } from "./setup";
import {
  initializeEvolution,
  type WorkPatternAssignment,
} from "./evolution-model";
import { Select, Text, SelectorEditor, AddRow, EntityHeader } from "./editors";
import { coreAction } from "./api";
import { notifyMessage, notifyResult, notifyError } from "./notifications";
import { useI18n } from "./i18n";
export function ReviewDialog({
  title,
  children,
  onCancel,
  onConfirm,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="diagnostic-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      {children}
      <div className="row">
        <button onClick={onCancel}>{t("Cancel")}</button>
        <button className="primary" disabled={disabled} onClick={onConfirm}>
          {t("Confirm changes")}
        </button>
      </div>
    </dialog>
  );
}
export function enableAssignmentRules(s: Scenario) {
  initializeEvolution(s);
  if (s.schemaVersion < 3) s.schemaVersion = 3;
  s.workPatternAssignmentRules ??= [];
}
export function PatternChoice({
  s,
  value,
  onChange,
  temporal = false,
}: {
  s: Scenario;
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
  temporal?: boolean;
}) {
  const { t } = useI18n();
  const mode =
    typeof value === "string"
      ? "MANUAL"
      : value === null
        ? "AUTO"
        : temporal
          ? "INHERIT"
          : "AUTO";
  return (
    <>
      <Select
        label={
          temporal
            ? t("Dated pattern assignment mode")
            : t("Pattern assignment mode")
        }
        value={mode}
        options={[
          ...(temporal
            ? [
                {
                  id: "INHERIT",
                  label: t("Inherit individual base assignment"),
                },
              ]
            : []),
          { id: "AUTO", label: t("Automatic / inherited from rules") },
          { id: "MANUAL", label: t("Specific pattern / manual override") },
        ]}
        onChange={(x) => {
          if (x === "AUTO" && temporal && s.schemaVersion < 3) {
            notifyMessage(
              "Upgrade the scenario format explicitly before using temporal automatic overrides.",
              "WARNING",
            );
            return;
          }
          if (x === "MANUAL") {
            const first = s.workPatterns?.[0];
            if (first) onChange(first.id);
            else
              notifyMessage(
                "Create a work pattern before selecting a manual override.",
                "WARNING",
              );
          } else
            onChange(x === "INHERIT" ? undefined : temporal ? null : undefined);
        }}
      />
      {mode === "MANUAL" ? (
        <>
          <Select
            createKind="pattern"
            label={
              temporal
                ? t("Manual dated work pattern")
                : t("Manual base work pattern")
            }
            value={value as string}
            options={s.workPatterns ?? []}
            onChange={onChange}
          />
          <p className="hint">
            {t(
              "This individual assignment takes precedence over automatic rules.",
            )}
          </p>
        </>
      ) : (
        <p className="hint">
          {mode === "INHERIT"
            ? t(
                "The base individual pattern keeps its precedence; otherwise rules apply.",
              )
            : t(
                "No individual pattern is copied. Rules are resolved dynamically at each date.",
              )}
        </p>
      )}
    </>
  );
}
export function AssignmentOrigin({
  s,
  value,
}: {
  s: Scenario;
  value?: WorkPatternAssignment;
}) {
  const { t } = useI18n();
  if (!value) return null;
  return (
    <div className={value.origin === "CONFLICT" ? "error" : "hint"}>
      <strong>
        {s.workPatterns?.find((p) => p.id === value.workPatternId)?.label ??
          t(
            value.origin === "NONE"
              ? "No work pattern"
              : "Resolved work pattern",
          )}
      </strong>{" "}
      · {t(value.origin)}
      {value.ruleIds?.length
        ? ` · ${value.ruleIds.map((id) => s.workPatternAssignmentRules?.find((r) => r.id === id)?.label ?? id).join(", ")}`
        : ""}
      {value.message && <p>{value.message}</p>}
    </div>
  );
}
export function PatternAssignmentRules({
  s,
  update,
}: {
  s: Scenario;
  update: Update;
}) {
  const { t, diagnostic } = useI18n();
  const [onDate, setDate] = useState(s.calendar.start),
    [preview, setPreview] = useState<Result>(),
    [snapshot, setSnapshot] = useState("");
  const stale = !!preview && snapshot !== JSON.stringify(s);
  return (
    <section className="panel">
      <EntityHeader title={t("Automatic work-pattern assignments")} />
      <p className="hint">
        {t(
          "Define rules once using existing attributes or groups. Individual assignments keep precedence; higher rule priority wins.",
        )}
      </p>
      {s.schemaVersion < 3 && (
        <p className="hint">
          {t(
            "Upgrade to schema 3 to add automatic rules. Existing individual assignments remain unchanged.",
          )}
        </p>
      )}
      {(s.workPatternAssignmentRules ?? []).map((r, i) => (
        <article className="item-card" key={r.id}>
          <div className="row">
            <Text
              label={t("Assignment rule label")}
              value={r.label}
              onChange={(x) =>
                update((d) => {
                  d.workPatternAssignmentRules![i].label = x;
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) =>
                  update((d) => {
                    d.workPatternAssignmentRules![i].enabled = e.target.checked;
                  })
                }
              />
              {t("Enabled")}
            </label>
            <button
              className="danger"
              onClick={() =>
                update((d) => {
                  d.workPatternAssignmentRules!.splice(i, 1);
                })
              }
            >
              {t("Remove assignment rule")}
            </button>
          </div>
          <Select
            createKind="pattern"
            label={t("Assigned work pattern")}
            value={r.workPatternId}
            options={s.workPatterns ?? []}
            onChange={(x) =>
              update((d) => {
                d.workPatternAssignmentRules![i].workPatternId = x;
              })
            }
          />
          <SelectorEditor
            s={s}
            value={r.selector}
            onChange={(x) =>
              update((d) => {
                d.workPatternAssignmentRules![i].selector = x;
              })
            }
          />
          <div className="row">
            <Text
              label={t("Valid from")}
              type="date"
              value={r.validFrom}
              onChange={(x) =>
                update((d) => {
                  d.workPatternAssignmentRules![i].validFrom = x;
                })
              }
            />
            <Text
              label={t("Valid until (exclusive)")}
              type="date"
              value={r.validTo ?? ""}
              onChange={(x) =>
                update((d) => {
                  if (x) d.workPatternAssignmentRules![i].validTo = x;
                  else delete d.workPatternAssignmentRules![i].validTo;
                })
              }
            />
          </div>
          <details>
            <summary>{t("Rule priority and stable ID")}</summary>
            <Text
              label={t("Rule priority (higher wins)")}
              type="number"
              value={r.priority}
              onChange={(x) =>
                update((d) => {
                  d.workPatternAssignmentRules![i].priority = Number(x);
                })
              }
            />
            <code>{r.id}</code>
          </details>
          {!stale &&
            preview?.workforce?.rules
              ?.filter((row) => row.ruleId === r.id)
              .map((row, j) => (
                <p className="hint" key={j}>
                  {t("Matching employees: {count}", {
                    count: row.employeeIds.length,
                  })}{" "}
                  ·{" "}
                  {row.employeeIds
                    .map(
                      (id) => s.employees.find((e) => e.id === id)?.label ?? id,
                    )
                    .join(", ")}
                </p>
              ))}
        </article>
      ))}
      <AddRow
        label={t("Add automatic assignment rule")}
        onAdd={() => {
          if (s.schemaVersion < 3) {
            notifyMessage(
              "Upgrade the scenario format explicitly before adding automatic rules.",
              "WARNING",
            );
            return;
          }
          update((d) => {
            enableAssignmentRules(d);
            d.workPatternAssignmentRules!.push({
              id: "pattern-rule:" + crypto.randomUUID().slice(0, 8),
              label: t("New assignment rule"),
              enabled: true,
              workPatternId: d.workPatterns?.[0]?.id ?? "",
              priority: 10,
              validFrom: d.calendar.start,
              selector: {},
            });
          });
        }}
      />
      {!s.workPatterns?.length && (
        <p className="hint">
          {t(
            "Create reusable work patterns above, then associate them with attributes or groups here.",
          )}
        </p>
      )}
      <h3>{t("Preview effective work-pattern assignments")}</h3>
      <div className="row">
        <Text
          label={t("Assignment preview date")}
          type="date"
          value={onDate}
          onChange={setDate}
        />
        <button
          onClick={async () => {
            const r = await coreAction("inspect-patterns", s, { onDate }).catch(
              () => undefined,
            );
            if (r) {
              setPreview(r);
              setSnapshot(JSON.stringify(s));
            }
          }}
        >
          {t("Preview pattern assignments")}
        </button>
      </div>
      {stale && (
        <p className="hint">
          {t(
            "Configuration changed. Refresh this preview before relying on its values.",
          )}
        </p>
      )}
      {preview?.diagnostics.map((d, i) => (
        <p className={d.severity === "ERROR" ? "error" : "hint"} key={i}>
          {diagnostic(d)}
        </p>
      ))}
      {preview?.workforce && (
        <div className="table-scroll">
          <table data-testid="pattern-preview">
            <thead>
              <tr>
                <th>{t("Employee")}</th>
                <th>{t("Active")}</th>
                <th>{t("Week profile")}</th>
                <th>{t("Effective pattern and origin")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.workforce.employees.map((e, i) => (
                <tr key={`${e.employeeId}:${i}`}>
                  <th scope="row">{e.label}</th>
                  <td>{e.active ? t("Yes") : t("No")}</td>
                  <td>
                    {s.weekProfiles?.find((p) => p.id === e.profileId)?.label ??
                      e.profileId ??
                      "—"}
                  </td>
                  <td>
                    <AssignmentOrigin s={s} value={e.workPatternAssignment} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function VariantApplicability({
  s,
  shiftId,
  variantId,
}: {
  s: Scenario;
  shiftId: string;
  variantId: string;
}) {
  const { t, diagnostic } = useI18n();
  const [from, setFrom] = useState(s.calendar.start),
    [through, setThrough] = useState(s.calendar.start),
    [rows, setRows] =
      useState<
        { date: string; employee: string; hours: string; admissible: boolean }[]
      >(),
    [errors, setErrors] = useState<Result["diagnostics"]>([]),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>{t("Preview variant applicability")}</summary>
      <div className="row">
        <Text
          label={t("Variant preview start")}
          type="date"
          value={from}
          onChange={setFrom}
        />
        <Text
          label={t("Variant preview end")}
          type="date"
          value={through}
          onChange={setThrough}
        />
        <button
          disabled={busy}
          onClick={async () => {
            const start = Date.parse(from + "T12:00:00Z"),
              end = Date.parse(through + "T12:00:00Z");
            if (
              !Number.isFinite(start) ||
              !Number.isFinite(end) ||
              end < start ||
              end - start > 13 * 86400000
            ) {
              notifyMessage(
                "Choose a valid preview interval of at most 14 days.",
                "WARNING",
              );
              return;
            }
            setBusy(true);
            try {
              const found: NonNullable<typeof rows> = [],
                diagnostics: Result["diagnostics"] = [];
              for (let at = start; at <= end; at += 86400000) {
                const date = new Date(at).toISOString().slice(0, 10);
                const result = await coreAction(
                  "inspect",
                  s,
                  { onDate: date },
                  { silent: true },
                );
                diagnostics.push(...result.diagnostics);
                if (result.status !== "INSPECTED") break;
                for (const employee of result.workforce?.employees ?? [])
                  for (const shift of employee.shifts)
                    if (
                      shift.shiftId === shiftId &&
                      shift.variantId === variantId
                    )
                      found.push({
                        date,
                        employee: employee.label,
                        hours: shift.intervals
                          .map(
                            (x) =>
                              `${x.start}–${x.end}${x.endDayOffset ? " +1" : ""}`,
                          )
                          .join(", "),
                        admissible: shift.admissible,
                      });
              }
              setRows(found);
              setErrors(diagnostics);
              notifyResult({
                status: diagnostics.some(
                  (d) => (d.severity ?? "ERROR") === "ERROR",
                )
                  ? "VALIDATION_ERROR"
                  : "INSPECTED",
                diagnostics,
              });
            } catch (e) {
              notifyError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Preview applicable employees and dates")}
        </button>
      </div>
      <p className="hint">
        {t(
          "Up to 14 days; the core resolves variant precedence, work patterns and admissibility.",
        )}
      </p>
      {errors.map((d, i) => (
        <p className="error" key={i}>
          {diagnostic(d)}
        </p>
      ))}
      {rows && (
        <>
          <p>
            {t("Applicable employee-days: {count}", { count: rows.length })}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Employee")}</th>
                  <th>{t("Effective hours")}</th>
                  <th>{t("Admissible")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.employee}</td>
                    <td>{r.hours}</td>
                    <td>{r.admissible ? t("Yes") : t("No")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  );
}
