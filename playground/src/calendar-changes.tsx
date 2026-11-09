import { useEffect, useRef, useState } from "react";
import { type Scenario, type Result, id } from "./model";
import type { ScheduleArchive } from "./archives";
import type { CalendarCell } from "./calendar-export-model";
import { Text, Select } from "./editors";
import { IntervalEditor } from "./evolution";
import type { Interval } from "./evolution-model";
import { useI18n } from "./i18n";
import { coreAction } from "./api";
import type { Run } from "./results";
import {
  type ChangeSet,
  type ChangeReview,
  reviewChange,
  applyReviewedChange,
  proposedCalendar,
} from "./change-review";
import { summarizeChanges } from "./change-summary";
import { notifyError, notifyResult } from "./notifications";
export function CalendarChanges({
  s,
  archive,
  archives,
  run,
  initialCell,
  initialAction = "ABSENCE",
  onClose,
}: {
  s: Scenario;
  archive?: ScheduleArchive;
  archives: ScheduleArchive[];
  run: Run;
  initialCell?: CalendarCell;
  initialAction?: string;
  onClose: () => void;
}) {
  const { t, diagnostic } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState(initialAction),
    [person, setPerson] = useState(
      initialCell?.employeeId ?? s.employees[0]?.id ?? "",
    ),
    [from, setFrom] = useState(initialCell?.date ?? s.calendar.start),
    [end, setEnd] = useState(initialCell?.date ?? s.calendar.start),
    [name, setName] = useState(""),
    [role, setRole] = useState(s.employeeTypes[0]?.id ?? ""),
    [shift, setShift] = useState(
      s.shifts.find((sh) => sh.kind === "WORKING")?.id ?? "",
    ),
    [intervals, setIntervals] = useState<Interval[]>(() =>
      structuredClone(
        s.shifts.find((sh) => sh.kind === "WORKING")?.intervals ?? [],
      ),
    ),
    [pattern, setPattern] = useState(""),
    [attribute, setAttribute] = useState(
      s.attributeDefinitions?.find((a) => a.type === "ENUM")?.id ?? "",
    ),
    [value, setValue] = useState(""),
    [absence, setAbsence] = useState(""),
    [authorize, setAuthorize] = useState(false),
    [review, setReview] = useState<ChangeReview>(),
    [doc, setDoc] = useState<ChangeSet>(),
    [error, setError] = useState<Result>(),
    [working, setWorking] = useState(false),
    [regenerate, setRegenerate] = useState(true);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  const earliest =
    s.history.through && s.history.through >= from
      ? s.history.through
      : undefined;
  const hard = action === "HOURS" || action === "CLOSURE";
  const official = proposedCalendar(s, archives, from);
  const affectedFrom = from < s.calendar.start ? s.calendar.start : from;
  const build = async () => {
    const context = await coreAction("context", s, {}, { silent: true });
    if (context.status !== "CONTEXT") {
      notifyResult(context);
      return;
    }
    const hashes = (
      context.context as {
        entityHashes: Record<string, Record<string, string>>;
      }
    ).entityHashes;
    const operations: Record<string, unknown>[] = [];
    if (action === "ABSENCE") {
      const entry = {
        id: absence || id("unavailable"),
        selector: { employeeIds: [person] },
        scope: { start: from, end },
        state: "ABSENT",
      };
      operations.push(
        absence
          ? {
              op: "REPLACE_AVAILABILITY",
              value: entry,
              expectedEntityHash: hashes.availability[absence],
            }
          : { op: "CREATE_AVAILABILITY", value: entry },
      );
    } else if (action === "CLOSURE") {
      const reopen = new Date(end + "T12:00:00Z");
      reopen.setUTCDate(reopen.getUTCDate() + 1);
      operations.push({
        op: "SET_CLOSURES",
        value: [
          ...(s.calendar.closures ?? []),
          {
            id: id("closure"),
            label: t("Business closure"),
            validFrom: from,
            validTo: reopen.toISOString().slice(0, 10),
            selector: {},
            reason: t("Business closure"),
            exceptions: [],
          },
        ],
      });
    } else if (action === "PERSON")
      operations.push({
        op: "CREATE_EMPLOYEE",
        value: {
          id: id("person"),
          label: name,
          typeId: role,
          attributes: {},
          employment: { validFrom: from },
          versions: [],
          ...(pattern ? { workPatternId: pattern } : {}),
        },
      });
    else if (action === "PATTERN" || action === "CONTRACT")
      operations.push({
        op: "UPDATE_EMPLOYEE",
        employeeId: person,
        effectiveFrom: from,
        patch:
          action === "PATTERN"
            ? { workPatternId: pattern || null }
            : { attributes: { [attribute]: value } },
      });
    else if (action === "HOURS") {
      const selected = structuredClone(s.shifts.find((sh) => sh.id === shift)!);
      if (!selected.variants?.length)
        selected.variants = [
          {
            id: selected.id,
            label: t("Existing hours"),
            priority: 0,
            selector: {},
            scope: {},
            intervals: selected.intervals,
          },
        ];
      selected.variants.push({
        id: id("hours"),
        label: t("Future working hours"),
        priority: Math.max(...selected.variants.map((v) => v.priority), 0) + 1,
        selector: {},
        scope: { start: from },
        intervals,
      });
      operations.push({
        op: "REPLACE_SHIFT",
        value: selected,
        expectedEntityHash: hashes.shifts[shift],
      });
    }
    return {
      format: "rostercore.scenario-change-set",
      schemaVersion: 1,
      id: id("change"),
      scenarioId: s.id,
      expectedRevision: s.revision,
      allowHardRuleChanges: hard && authorize,
      referenceDate: from,
      operations,
    } as ChangeSet;
  };
  const preview = async (proposal = false) => {
    setWorking(true);
    setError(undefined);
    try {
      if (action === "REGENERATE") {
        if (official) {
          const check = await coreAction(
            "archives",
            s,
            {
              document: {
                operation: "REVISE",
                id: official.id,
                from: affectedFrom,
                archives,
                expectedRevision: s.revision,
                dryRun: true,
              },
            },
            { silent: true },
          );
          if (check.status !== "PREVIEW") {
            setError(check);
            return;
          }
        }
        setReview({
          scenario: s,
          document: {
            format: "rostercore.scenario-change-set",
            schemaVersion: 1,
            id: id("regenerate"),
            scenarioId: s.id,
            expectedRevision: s.revision,
            allowHardRuleChanges: false,
            operations: [],
          },
          result: { status: "PREVIEW", diagnostics: [] },
          signature: JSON.stringify(s),
          ...(official
            ? { proposal: { archiveId: official.id, from: affectedFrom } }
            : {}),
        });
        return;
      }
      const document = doc ?? (await build());
      if (!document) return;
      setDoc(document);
      const result = await reviewChange(
        s,
        document,
        archives,
        proposal && official
          ? { archiveId: official.id, from: affectedFrom }
          : undefined,
      );
      if (result.result.status === "PREVIEW") setReview(result);
      else {
        setError(result.result);
        if (
          !result.result.diagnostics.some((d) =>
            ["PROTECTED_ASSIGNMENT", "CLOSURE_PROTECTED_CONFLICT"].includes(
              d.code,
            ),
          )
        )
          notifyResult(result.result);
      }
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const apply = async () => {
    if (!review) return;
    setWorking(true);
    try {
      let result: Result | undefined;
      if (action === "REGENERATE") {
        let context = s;
        if (review.proposal) {
          result = await run("archives", {
            scenario: s,
            document: {
              operation: "REVISE",
              id: review.proposal.archiveId,
              from: review.proposal.from,
              archives,
              expectedRevision: s.revision,
              dryRun: false,
            },
          });
          if (!result?.scenario) return;
          context = result.scenario;
        }
        if (archive)
          result = await run("regenerate", {
            scenario: context,
            document: {
              from: affectedFrom,
              previousScenario: archive.scenario,
              previousScenarioEncoding: archive.scenarioEncoding,
              previousResult: archive.result,
              stabilityPriority: "AFTER_FAIRNESS",
            },
          });
        else result = await run("solve", { scenario: context });
      } else {
        result = await applyReviewedChange(review, s, archives, run);
        if (result?.scenario && regenerate && archive) {
          result = await run("regenerate", {
            scenario: result.scenario,
            document: {
              from: affectedFrom,
              previousScenario: archive.scenario,
              previousScenarioEncoding: archive.scenarioEncoding,
              previousResult: archive.result,
              stabilityPriority: "AFTER_FAIRNESS",
            },
          });
        }
      }
      if (
        result &&
        !["VALIDATION_ERROR", "MODEL_INVALID"].includes(result.status)
      )
        onClose();
      else if (result) setError(result);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const options = [
    { id: "ABSENCE", label: t("Record or change unavailability") },
    { id: "CLOSURE", label: t("Add a business closure") },
    { id: "HOURS", label: t("Change standard working hours") },
    { id: "PERSON", label: t("Add a colleague") },
    { id: "CONTRACT", label: t("Change a contract") },
    { id: "PATTERN", label: t("Change a work pattern") },
    { id: "REGENERATE", label: t("Regenerate future dates") },
  ];
  return (
    <dialog
      ref={ref}
      className="calendar-change-dialog"
      aria-label={t("Modify planning")}
      onCancel={(e) => {
        e.preventDefault();
        if (!working) onClose();
      }}
    >
      <h2>{t(review ? "Review planning change" : "Modify planning")}</h2>
      {!review ? (
        <>
          <Select
            label={t("What do you want to do?")}
            value={action}
            options={options}
            onChange={(v) => {
              setAction(v);
              setDoc(undefined);
              setError(undefined);
            }}
          />
          {!["PERSON", "HOURS", "CLOSURE", "REGENERATE"].includes(action) && (
            <Select
              label={t("Person")}
              value={person}
              options={s.employees}
              onChange={(v) => {
                setPerson(v);
                setDoc(undefined);
              }}
            />
          )}
          {action === "ABSENCE" && (
            <>
              <Select
                label={t("Unavailability entry")}
                value={absence}
                options={[
                  { id: "", label: t("New unavailability") },
                  ...s.availability
                    .filter(
                      (a) =>
                        a.selector.employeeIds?.length === 1 &&
                        a.selector.employeeIds[0] === person,
                    )
                    .map((a) => ({
                      id: a.id,
                      label:
                        (a.scope.start ?? s.calendar.start) +
                        " - " +
                        (a.scope.end ?? s.calendar.end),
                    })),
                ]}
                onChange={(v) => {
                  setAbsence(v);
                  setDoc(undefined);
                  const a = s.availability.find((a) => a.id === v);
                  if (a) {
                    setFrom(a.scope.start ?? s.calendar.start);
                    setEnd(a.scope.end ?? s.calendar.end);
                  }
                }}
              />
              <p className="hint">
                {t(
                  "The calendar will show generic unavailability. This form does not collect medical details.",
                )}
              </p>
            </>
          )}
          <div className="row">
            <Text
              label={t("Effective from")}
              type="date"
              value={from}
              onChange={(v) => {
                setFrom(v);
                setDoc(undefined);
              }}
            />
            {["ABSENCE", "CLOSURE"].includes(action) && (
              <Text
                label={t("Through, inclusive")}
                type="date"
                value={end}
                onChange={(v) => {
                  setEnd(v);
                  setDoc(undefined);
                }}
              />
            )}
          </div>
          {action === "PERSON" && (
            <>
              <Text
                label={t("Colleague name")}
                value={name}
                onChange={(v) => {
                  setName(v);
                  setDoc(undefined);
                }}
              />
              <Select
                label={t("Role")}
                value={role}
                options={s.employeeTypes}
                onChange={(v) => {
                  setRole(v);
                  setDoc(undefined);
                }}
              />
            </>
          )}
          {["PATTERN", "PERSON"].includes(action) && (
            <Select
              label={t("Work pattern")}
              value={pattern}
              options={[
                { id: "", label: t("Use automatic rules") },
                ...(s.workPatterns ?? []),
              ]}
              onChange={(v) => {
                setPattern(v);
                setDoc(undefined);
              }}
            />
          )}
          {action === "CONTRACT" && (
            <>
              <Select
                label={t("Contract attribute")}
                value={attribute}
                options={(s.attributeDefinitions ?? []).filter(
                  (a) => a.type === "ENUM",
                )}
                onChange={(v) => {
                  setAttribute(v);
                  setValue("");
                  setDoc(undefined);
                }}
              />
              <Select
                label={t("New contract")}
                value={value}
                options={(
                  s.attributeDefinitions?.find((a) => a.id === attribute)
                    ?.values ?? []
                ).map((v) => ({ id: String(v), label: String(v) }))}
                onChange={(v) => {
                  setValue(v);
                  setDoc(undefined);
                }}
              />
            </>
          )}
          {action === "HOURS" && (
            <>
              <Select
                label={t("Shift")}
                value={shift}
                options={s.shifts.filter((sh) => sh.kind === "WORKING")}
                onChange={(v) => {
                  setShift(v);
                  const sh = s.shifts.find((sh) => sh.id === v);
                  setIntervals(
                    sh?.intervals.length
                      ? sh.intervals
                      : (sh?.variants?.[0]?.intervals ?? []),
                  );
                  setDoc(undefined);
                }}
              />
              <IntervalEditor
                value={intervals}
                onChange={(v) => {
                  setIntervals(v);
                  setDoc(undefined);
                }}
              />
            </>
          )}
          {hard && (
            <label>
              <input
                type="checkbox"
                checked={authorize}
                onChange={(e) => {
                  setAuthorize(e.target.checked);
                  setDoc(undefined);
                }}
              />
              {t("I authorize this change to opening or working-time rules")}
            </label>
          )}
          {earliest && (
            <p className="warning">
              {t("Confirmed work is protected. Choose a date after {date}.", {
                date: earliest,
              })}
            </p>
          )}
          {error && (
            <div role="alert">
              {error.diagnostics.some((d) =>
                ["PROTECTED_ASSIGNMENT", "CLOSURE_PROTECTED_CONFLICT"].includes(
                  d.code,
                ),
              ) && (
                <p>
                  {t(
                    "This change affects protected work. Create a future revision proposal; the original calendar stays official until you publish its replacement.",
                  )}
                </p>
              )}
              {error.diagnostics.map((d) => (
                <p key={d.code}>{diagnostic(d)}</p>
              ))}
              {official &&
                !earliest &&
                error.diagnostics.some((d) =>
                  [
                    "PROTECTED_ASSIGNMENT",
                    "CLOSURE_PROTECTED_CONFLICT",
                  ].includes(d.code),
                ) && (
                  <button disabled={working} onClick={() => preview(true)}>
                    {t("Preview as a revision proposal")}
                  </button>
                )}
            </div>
          )}
          {archive && action !== "REGENERATE" && (
            <label>
              <input
                type="checkbox"
                checked={regenerate}
                onChange={(e) => setRegenerate(e.target.checked)}
              />
              {t("Regenerate the affected future dates after applying")}
            </label>
          )}
        </>
      ) : (
        <>
          <ul className="change-summary">
            {(action === "REGENERATE"
              ? [
                  t(
                    "Regenerate from {date}, preserving earlier and confirmed work.",
                    { date: affectedFrom },
                  ),
                ]
              : summarizeChanges(
                  review.document as unknown as Record<string, unknown>,
                  s,
                  t,
                )
            ).map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          {review.proposal && (
            <p className="notice">
              {t(
                "This creates a future revision proposal. The original publication remains official until its replacement is explicitly published.",
              )}
            </p>
          )}
          <p>
            {t("Confirmed work and its historical balances are preserved.")}
          </p>
          <details className="advanced-only">
            <summary>{t("Technical preview")}</summary>
            <pre>
              {JSON.stringify(
                {
                  ...(review.result.preview as Record<string, unknown>),
                  scenario: undefined,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
      <div className="dialog-actions">
        <button
          disabled={working}
          onClick={
            review
              ? () => {
                  setReview(undefined);
                  setDoc(undefined);
                }
              : onClose
          }
        >
          {t(review ? "Back" : "Cancel")}
        </button>
        <button
          className="primary"
          disabled={
            working ||
            (!review &&
              ((hard && !authorize) ||
                (action === "PERSON" && !name.trim()) ||
                (action === "CONTRACT" && !value) ||
                Boolean(earliest)))
          }
          onClick={() => (review ? apply() : preview())}
        >
          {t(
            working
              ? "Working..."
              : review
                ? "Apply planning change"
                : "Preview planning change",
          )}
        </button>
      </div>
    </dialog>
  );
}
