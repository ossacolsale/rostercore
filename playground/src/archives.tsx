import { useState } from "react";
import { type Scenario, type Result, download } from "./model";
import { useI18n } from "./i18n";
import { ReviewDialog } from "./pattern-assignments";
import { notifyError } from "./notifications";
import { Text, Select } from "./editors";
export type ScheduleArchive = {
  format: "rostercore.schedule-archive";
  schemaVersion: 1;
  id: string;
  revision: number;
  scenarioId: string;
  scenarioRevision: number;
  configurationHash: string;
  state: "DRAFT" | "PUBLISHED" | "COMPLETED" | "SUPERSEDED";
  period: { start: string; end: string };
  scenario: Scenario;
  result: Result;
  createdAt: string;
  completedThrough?: string;
  supersedesId?: string;
  integrityHash: string;
};
export type ArchiveRequest = Record<string, unknown> & { operation: string };
export function textDownload(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ScheduleLibrary({
  s,
  archives,
  activeId,
  run,
  onCompare,
  comparisonScenarioId,
}: {
  comparisonScenarioId?: string;
  s: Scenario;
  archives: ScheduleArchive[];
  activeId?: string;
  run: (
    action: string,
    extra?: Record<string, unknown>,
  ) => Promise<Result | undefined>;
  onCompare: (result: Result) => void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState<{
      request: ArchiveRequest;
      preview: Record<string, unknown>;
    }>(),
    [incoming, setIncoming] = useState<unknown>(),
    [mode, setMode] = useState("REFERENCE");
  const request = (data: ArchiveRequest, dryRun: boolean) => ({
    ...data,
    archives,
    dryRun,
    expectedRevision: s.revision,
    at: new Date().toISOString(),
  });
  const review = async (data: ArchiveRequest) => {
    const document = request(data, true);
    const r = await run("archives", { document });
    if (r?.status === "PREVIEW")
      setPending({
        request: document,
        preview: r.preview as Record<string, unknown>,
      });
  };
  const read = async (data: ArchiveRequest) =>
    await run("archives", { document: request(data, false) });
  const backup = async (history = false) => {
    const r = await read({
      operation: "BACKUP",
      createdAt: new Date().toISOString(),
    });
    if (r?.document)
      download(
        `${s.id}.${history ? "history-context" : "workspace"}.json`,
        r.document,
      );
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("Input exceeds 8 MiB");
      setIncoming(JSON.parse(await file.text()));
    } catch (e) {
      notifyError((e as Error).message);
    }
  };
  const incomingFormat = (incoming as { format?: string })?.format;
  return (
    <section className="panel schedule-library">
      <h2>{t("Saved calendars and backups")}</h2>
      <p className="hint">
        {t(
          "A published plan is protected future work. Only work explicitly confirmed as completed enters the historical fairness ledger.",
        )}
      </p>
      <div className="row">
        <button
          onClick={() => {
            try {
              textDownload(
                `${s.id}.browser-recovery.json`,
                JSON.stringify(
                  {
                    scenario: s,
                    rawArchiveStorage: localStorage.getItem(
                      "rostercore.archives.v1",
                    ),
                  },
                  null,
                  2,
                ),
                "application/json",
              );
            } catch (e) {
              notifyError((e as Error).message);
            }
          }}
        >
          {t("Export browser recovery data")}
        </button>
        <button onClick={() => backup()}>
          {t("Export complete workspace backup")}
        </button>
        <button onClick={() => backup(true)}>
          {t("Export consolidated history with context")}
        </button>
        <button
          disabled={!s.history.assignments.length}
          onClick={() =>
            review({
              operation: "REBUILD_HISTORY",
              useCurrentCategoryMembership: true,
            })
          }
        >
          {t("Rebuild historical quotas from completed calendars")}
        </button>
        <label className="button">
          {t("Import a calendar or backup")}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {Boolean(incoming) && (
        <div className="item-card">
          <h3>{t("Review the imported document")}</h3>
          {incomingFormat === "rostercore.workspace-backup" ? (
            <p className="warning">
              {t(
                "Restoring this backup replaces the current workspace. Export your current workspace first if you need to retain it.",
              )}
            </p>
          ) : incomingFormat === "rostercore.schedule-archive" ? (
            <>
              <Select
                label={t("How should this calendar be imported?")}
                value={mode}
                options={[
                  {
                    id: "REFERENCE",
                    label: t(
                      "Keep a reference copy; do not apply locks or history",
                    ),
                  },
                  {
                    id: "PUBLISH",
                    label: t("Activate official publication locks"),
                  },
                  {
                    id: "COMPLETE",
                    label: t("Restore explicitly completed work into history"),
                  },
                  {
                    id: "RESTORE_CONTEXT",
                    label: t("Restore the original scenario context"),
                  },
                ]}
                onChange={setMode}
              />
              <p className="hint">
                {t(
                  "The core checks the embedded context, integrity, stable identifiers, overlap and existing history before anything is applied.",
                )}
              </p>
            </>
          ) : incomingFormat === "rostercore.result" ? (
            <p>
              {t(
                "This older result needs the exact original scenario currently loaded. It will be converted into a contextual draft archive.",
              )}
            </p>
          ) : (
            <p className="error">
              {t(
                "Choose a canonical schedule archive, workspace backup or a result with its original scenario.",
              )}
            </p>
          )}
          <div className="row">
            <button
              onClick={() => {
                if (incomingFormat === "rostercore.workspace-backup")
                  review({ operation: "RESTORE", backup: incoming });
                else if (incomingFormat === "rostercore.schedule-archive")
                  review({ operation: "IMPORT", archive: incoming, mode });
                else if (incomingFormat === "rostercore.result")
                  review({
                    operation: "CREATE",
                    id: "schedule-" + crypto.randomUUID(),
                    result: incoming,
                    createdAt: new Date().toISOString(),
                    source: "legacy-result-import",
                  });
              }}
            >
              {t("Validate and preview import")}
            </button>
            <button onClick={() => setIncoming(undefined)}>
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {!archives.length && (
        <p className="hint">
          {t(
            "Generated calendars are saved here automatically after independent verification. Export a workspace backup for a portable copy.",
          )}
        </p>
      )}
      <div className="archive-list">
        {archives.map((a) => (
          <ArchiveCard
            key={a.id}
            a={a}
            s={s}
            active={a.id === activeId}
            onReview={review}
            onRead={read}
            canCompare={comparisonScenarioId === a.scenarioId}
            onCompare={() => onCompare(a.result)}
          />
        ))}
      </div>
      {pending && (
        <ReviewDialog
          title={t("Confirm calendar operation")}
          onCancel={() => setPending(undefined)}
          onConfirm={async () => {
            const r = await run("archives", {
              document: { ...pending.request, dryRun: false },
            });
            if (
              r &&
              !["VALIDATION_ERROR", "MODEL_INVALID"].includes(r.status)
            ) {
              setPending(undefined);
              setIncoming(undefined);
            }
          }}
        >
          <p>
            {t("Operation")}: {t(String(pending.preview.operation))}
          </p>
          <p>
            {t("History assignments")}:{" "}
            {String(pending.preview.historyAssignmentsBefore)} →{" "}
            {String(pending.preview.historyAssignmentsAfter)}
          </p>
          <p>
            {t("Protected future assignments")}:{" "}
            {String(pending.preview.publishedLocksBefore)} →{" "}
            {String(pending.preview.publishedLocksAfter)}
          </p>
          {Array.isArray(pending.preview.overlappingCalendars) &&
            pending.preview.overlappingCalendars.length > 0 && (
              <p className="warning">
                {t("Overlapping calendars detected: {count}", {
                  count: pending.preview.overlappingCalendars.length,
                })}
              </p>
            )}
          <p className="hint">
            {t(
              "Original calendars remain available. Conflicting official assignments and actual history cannot be overwritten silently.",
            )}
          </p>
          {pending.preview.operation === "REBUILD_HISTORY" && (
            <p className="warning">
              {t(
                "Recalculate quotas using the current fairness categories and the original workforce, hours and availability in completed archives. Actual assignments remain unchanged. Missing historical context stops the operation.",
              )}
            </p>
          )}
          {pending.preview.operation === "COMPLETE" && (
            <p className="warning">
              {t(
                "Confirm only shifts that were actually worked. Publication alone does not confirm completed work.",
              )}
            </p>
          )}
          <details className="advanced-only">
            <summary>{t("Technical preview")}</summary>
            <pre>
              {JSON.stringify(
                {
                  ...pending.preview,
                  archives: undefined,
                  scenario: undefined,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </ReviewDialog>
      )}
    </section>
  );
}
function ArchiveCard({
  a,
  s,
  active,
  onReview,
  onRead,
  onCompare,
  canCompare,
}: {
  a: ScheduleArchive;
  s: Scenario;
  active: boolean;
  onReview: (request: ArchiveRequest) => Promise<void>;
  onRead: (request: ArchiveRequest) => Promise<Result | undefined>;
  onCompare: () => void;
  canCompare: boolean;
}) {
  const { t } = useI18n();
  const [through, setThrough] = useState(a.completedThrough ?? a.period.end),
    [from, setFrom] = useState(
      s.calendar.start > a.period.start ? s.calendar.start : a.period.start,
    );
  return (
    <article className={`item-card ${active ? "selected-archive" : ""}`}>
      <h3>{a.scenario.label}</h3>
      <p>
        {a.period.start} – {a.period.end} ·{" "}
        <span className="badge">{t(a.state)}</span>
        {a.completedThrough &&
          ` · ${t("Completed through {date}", { date: a.completedThrough })}`}
      </p>
      <div className="row">
        <button onClick={() => onRead({ operation: "OPEN", id: a.id })}>
          {t("Open calendar")}
        </button>
        <button onClick={() => download(`${a.id}.schedule.json`, a)}>
          {t("Export calendar with context")}
        </button>
        <button
          onClick={async () => {
            const r = await onRead({ operation: "CSV", id: a.id });
            if (r?.csv)
              textDownload(`${a.id}.csv`, r.csv, "text/csv;charset=utf-8");
          }}
        >
          {t("Export readable CSV")}
        </button>
        <button
          disabled={!canCompare}
          title={
            !canCompare
              ? t(
                  "Generate or open a calendar from this scenario before comparing.",
                )
              : undefined
          }
          onClick={onCompare}
        >
          {t("Compare with current calendar")}
        </button>
      </div>
      {a.scenarioId === s.id && a.state !== "SUPERSEDED" && (
        <details>
          <summary>{t("Publication, completed work and revisions")}</summary>
          <div className="row">
            <button
              onClick={() => onReview({ operation: "PUBLISH", id: a.id })}
            >
              {t("Publish this calendar")}
            </button>
            <Text
              label={t("Actually worked through")}
              type="date"
              value={through}
              onChange={setThrough}
            />
            <button
              onClick={() =>
                onReview({ operation: "COMPLETE", id: a.id, through })
              }
            >
              {t("Confirm completed work")}
            </button>
          </div>
          {(a.state === "PUBLISHED" || a.state === "COMPLETED") && (
            <div className="row">
              <Text
                label={t("Proposal effective from")}
                type="date"
                value={from}
                onChange={setFrom}
              />
              <button
                disabled={from > a.period.end}
                onClick={() =>
                  onReview({ operation: "REVISE", id: a.id, from })
                }
              >
                {t("Create a revision proposal")}
              </button>
            </div>
          )}
        </details>
      )}
      <details className="advanced-only">
        <summary>{t("Stable references and provenance")}</summary>
        <p>
          {a.id} · {t("Revision")}: {a.revision}
        </p>
        <code>{a.configurationHash}</code>
      </details>
    </article>
  );
}
