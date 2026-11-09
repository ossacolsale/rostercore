import { useState } from "react";
import { type Scenario, type Result, download } from "./model";
import type { Run } from "./results";
import type { ScheduleArchive } from "./archives";
import { ReviewDialog } from "./pattern-assignments";
import { useI18n } from "./i18n";
import { notifyError, notifyResult } from "./notifications";
import { coreAction } from "./api";
import { summarizeChanges } from "./change-summary";
import {
  type ChangeSet,
  type ChangeReview,
  reviewChange,
  applyReviewedChange,
  proposedCalendar,
} from "./change-review";
export type AIScope = {
  start: string;
  end: string;
  employeeIds: string[];
  shiftIds: string[];
  diagnostics: string[];
};
export function AIConfiguration({
  s,
  run,
  busy,
  scope,
  archives = [],
}: {
  s: Scenario;
  run: Run;
  busy: boolean;
  scope?: AIScope;
  archives?: ScheduleArchive[];
}) {
  const { t, diagnostic } = useI18n();
  const [text, setText] = useState(""),
    [request, setRequest] = useState(""),
    [include, setInclude] = useState(false),
    [authorize, setAuthorize] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState<Result>(),
    [pending, setPending] = useState<{
      action: string;
      document: Record<string, unknown>;
      result: Result;
      signature: string;
      review?: ChangeReview;
    }>();
  const selected = scope ?? {
    start: s.calendar.start,
    end: s.calendar.end,
    employeeIds: [],
    shiftIds: [],
    diagnostics: [],
  };
  const official = proposedCalendar(s, archives, selected.start);
  const preview = async (proposal = false) => {
    setWorking(true);
    setError(undefined);
    try {
      if (new Blob([text]).size > 8 * 1024 * 1024)
        throw new Error("Input exceeds 8 MiB");
      const d = JSON.parse(text);
      if (d.format === "rostercore.scenario-change-set") {
        const document = {
          ...d,
          allowHardRuleChanges: authorize && d.allowHardRuleChanges === true,
        } as ChangeSet;
        const review = await reviewChange(
          s,
          document,
          archives,
          proposal && official
            ? { archiveId: official.id, from: selected.start }
            : undefined,
        );
        if (review.result.status === "PREVIEW")
          setPending({
            action: "change-set",
            document: review.document,
            result: review.result,
            review,
            signature: JSON.stringify(s),
          });
        else {
          setError(review.result);
          notifyResult(review.result, "change-set");
        }
      } else if (d.format === "rostercore.scenario") {
        const document = {
          candidate: d,
          expectedRevision: s.revision,
          mode: d.id === s.id ? "REPLACE_CURRENT" : "NEW_SCENARIO",
          allowHardRuleChanges: authorize,
        };
        const result = await run("import-scenario", { document, apply: false });
        if (result?.status === "PREVIEW")
          setPending({
            action: "import-scenario",
            document,
            result,
            signature: JSON.stringify(s),
          });
      } else
        throw new Error(
          "Choose a complete scenario or a typed scenario-change-set. Use the calendar library for archives and backups.",
        );
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const resources = async (copy = false) => {
    setWorking(true);
    try {
      const result = await coreAction("context", s, {}, { silent: true });
      if (result.status !== "CONTEXT") {
        notifyResult(result, "context");
        return;
      }
      const response = await fetch("/api/ai-resources");
      if (!response.ok) throw new Error("Cannot load AI authoring resources");
      const resources = await response.json();
      const context = structuredClone(result.context) as Record<
        string,
        unknown
      >;
      if (selected.employeeIds.length && Array.isArray(context.employees))
        context.employees = context.employees.filter((e: { id: string }) =>
          selected.employeeIds.includes(e.id),
        );
      const packet = {
        ...resources,
        format: "rostercore.ai-package",
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        request,
        scope: selected,
        instructions:
          "Return a typed rostercore.scenario-change-set for the exact scenarioId, expectedRevision and entity hashes, or a complete new scenario with a distinct ID. Apply only the requested change within the selected scope. Preserve protected work and unspecified fields. Never publish or confirm work. The user validates, previews and explicitly confirms changes locally.",
        context,
        ...(include ? { scenario: s } : {}),
        personalDataIncluded: include,
        privacy:
          "Default context omits names, leave records, actual assignments and full history. Review business labels and your own request before sharing. Personal data is included only when explicitly selected.",
      };
      if (copy)
        await navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
      else download(`${s.id}.ai-package.json`, packet);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const after = (pending?.result.preview as { scenario?: Scenario } | undefined)
    ?.scenario;
  const descriptions =
    pending?.action === "change-set"
      ? summarizeChanges(pending.document, s, t)
      : after
        ? [
            t("Load configuration for {name}", { name: after.label }),
            ...(
              [
                "employees",
                "shifts",
                "workPatterns",
                "dutyRequirements",
                "availability",
                "policies",
              ] as const
            )
              .filter((k) => JSON.stringify(s[k]) !== JSON.stringify(after[k]))
              .map((k) =>
                t("{section}: {before} before, {after} after", {
                  section: t(k),
                  before: s[k]?.length ?? 0,
                  after: after[k]?.length ?? 0,
                }),
              ),
          ]
        : [];
  return (
    <section className="panel ai-configuration">
      <h2>{t("Create or update configuration with AI")}</h2>
      <p>
        {t(
          "AI is optional. Describe the change, prepare a package for your own assistant, then import and review its answer. Nothing is sent or applied automatically.",
        )}
      </p>
      <label className="field">
        <span>{t("What would you like to change?")}</span>
        <textarea
          rows={3}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder={t("Describe the planning change in your own words")}
        />
      </label>
      <p>
        {selected.start} - {selected.end}
        {selected.employeeIds.length
          ? " · " +
            selected.employeeIds
              .map((id) => s.employees.find((e) => e.id === id)?.label ?? id)
              .join(", ")
          : ""}
      </p>
      <div className="row">
        <button disabled={busy || working} onClick={() => resources()}>
          {t("Prepare configuration for AI")}
        </button>
        <button disabled={busy || working} onClick={() => resources(true)}>
          {t("Copy AI package")}
        </button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
        />
        {t("Include the full current scenario and personal data")}
      </label>
      <p className="hint">
        {t(
          "The default package omits employee names, leave records, actual assignments and unused attributes. Review custom labels before sharing.",
        )}
      </p>
      <label className="button">
        {t("Choose a configuration file")}
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) {
              notifyError("Input exceeds 8 MiB");
              return;
            }
            setText(await f.text());
            setPending(undefined);
            e.target.value = "";
          }}
        />
      </label>
      <details>
        <summary>{t("Paste a JSON answer")}</summary>
        <label className="field">
          <span>{t("Complete scenario or scenario change-set JSON")}</span>
          <textarea
            rows={7}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPending(undefined);
            }}
          />
        </label>
      </details>
      <label>
        <input
          type="checkbox"
          checked={authorize}
          onChange={(e) => {
            setAuthorize(e.target.checked);
            setPending(undefined);
          }}
        />
        {t(
          "Explicitly authorize changes to calendar, definitions and hard rules",
        )}
      </label>
      <button
        disabled={busy || working || !text.trim()}
        onClick={() => preview()}
      >
        {t("Validate and preview configuration")}
      </button>
      {error && (
        <div role="alert">
          {error.diagnostics.map((d, i) => (
            <p key={i}>{diagnostic(d)}</p>
          ))}
          {official &&
            error.diagnostics.some((d) =>
              ["PROTECTED_ASSIGNMENT", "CLOSURE_PROTECTED_CONFLICT"].includes(
                d.code,
              ),
            ) && (
              <button onClick={() => preview(true)}>
                {t("Preview as a revision proposal")}
              </button>
            )}
        </div>
      )}
      {pending && (
        <ReviewDialog
          title={t("Review configuration changes")}
          onCancel={() => setPending(undefined)}
          disabled={busy || pending.signature !== JSON.stringify(s)}
          onConfirm={async () => {
            const r = pending.review
              ? await applyReviewedChange(pending.review, s, archives, run)
              : await run(pending.action, {
                  document: pending.document,
                  apply: true,
                });
            if (r?.status === "IMPORTED") setPending(undefined);
          }}
        >
          <ul className="change-summary">
            {descriptions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          {pending.review?.proposal && (
            <p className="notice">
              {t(
                "This creates a future revision proposal. The original publication remains official until its replacement is explicitly published.",
              )}
            </p>
          )}
          <p>
            {t(
              "Review these differences before applying. Confirmed actual history and official assignments are protected; a conflicting published period requires a revision proposal first.",
            )}
          </p>
          {(pending.result.preview as { historyRebuildRequired?: boolean })
            ?.historyRebuildRequired && (
            <p className="warning">
              {t(
                "These fairness changes require an explicit historical snapshot rebuild from original dated context before generation. Actual assignments remain preserved.",
              )}
            </p>
          )}
          <details>
            <summary>{t("Technical preview")}</summary>
            <pre>
              {JSON.stringify(
                {
                  ...(pending.result.preview as Record<string, unknown>),
                  scenario: undefined,
                },
                null,
                2,
              )}
            </pre>
            <pre>{JSON.stringify(pending.document, null, 2)}</pre>
          </details>
        </ReviewDialog>
      )}
    </section>
  );
}
