import { useMemo, useState } from "react";
import { type Scenario, type Result, download } from "./model";
import type { Run } from "./api";
import { Icon } from "./icons";
import { Select } from "./editors";
import type { ScheduleArchive } from "./archives";
import { ReviewDialog } from "./review-dialog";
import { useI18n } from "./i18n";
import { notifyError, notifyMessage } from "./notifications";
import { coreAction } from "./api";
import { summarizeChanges } from "./change-summary";
import { workspaceRequest } from "./workspace";
import {
  type ChangeSet, type ChangeReview, reviewChange, applyReviewedChange, proposedCalendar,
} from "./change-review";

export type AIScope = {
  start: string;
  end: string;
  employeeIds: string[];
  shiftIds: string[];
  diagnostics: string[];
};

export function AIConfiguration({ s, run, busy, scope, archives = [], importOnly = false, showHeading = true, revision }: {
  s?: Scenario;
  run: Run;
  busy: boolean;
  scope?: AIScope;
  archives?: ScheduleArchive[];
  importOnly?: boolean;
  showHeading?: boolean;
  revision?: number;
}) {
  const { t, diagnostic } = useI18n();
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [archiveMode, setArchiveMode] = useState("REFERENCE");
  const [completed, setCompleted] = useState(false);
  const [request, setRequest] = useState("");
  const [include, setInclude] = useState(false);
  const [full, setFull] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<Result>();
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState<{
    action: string;
    document: Record<string, unknown>;
    result: Result;
    revision?: number;
    review?: ChangeReview;
  }>();
  const selected = scope ?? (s && { start: s.calendar.start, end: s.calendar.end, employeeIds: [], shiftIds: [], diagnostics: [] });
  const official = s && selected && proposedCalendar(s, archives, selected.start);
  const candidate = useMemo<Record<string, unknown> | undefined>(() => {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }, [text]);
  const format = candidate?.format;
  const rawRecovery = !format && candidate && "rawArchiveStorage" in candidate &&
    ("rawScenarioStorage" in candidate || "scenario" in candidate);
  const calendarFile = format === "rostercore.schedule-archive";
  const replacement = format === "rostercore.workspace-backup" ||
    (calendarFile && archiveMode === "RESTORE_CONTEXT");
  const formatLabel = rawRecovery ? "Browser recovery file" :
    typeof format === "string" ? ({
      "rostercore.scenario": "Configuration file",
      "rostercore.scenario-change-set": "Configuration changes",
      "rostercore.workspace-backup": "Workspace backup",
      "rostercore.schedule-archive": "Saved calendar",
      "rostercore.result": "Earlier calendar result",
    } as Record<string, string>)[format] : undefined;
  const resetImport = () => {
    setAuthorize(false); setArchiveMode("REFERENCE"); setCompleted(false);
    setPending(undefined); setError(undefined); setFailure("");
  };
  const preview = async (proposal = false) => {
    setPending(undefined);
    setWorking(true);
    setError(undefined);
    setFailure("");
    try {
      if (new Blob([text]).size > 8 * 1024 * 1024) throw new Error("Input exceeds 8 MiB");
      if (!candidate || typeof candidate !== "object")
        throw new Error("This file could not be read. Choose a RosterCore export or check the pasted text.");
      if (format === "rostercore.scenario-change-set") {
        if (!s || s.id !== candidate.scenarioId)
          throw new Error("Open the workspace that this change was prepared for, then import the file there.");
        const document = {
          ...candidate, allowHardRuleChanges: authorize && candidate.allowHardRuleChanges === true,
        } as ChangeSet;
        const review = await reviewChange(s, document, archives,
          proposal && official && selected ? { archiveId: official.id, from: selected.start } : undefined);
        if (review.result.status === "PREVIEW")
          setPending({ action: "change-set", document: review.document, result: review.result, revision, review });
        else setError(review.result);
        return;
      }
      let action: string;
      let document: Record<string, unknown>;
      const at = new Date().toISOString();
      if (format === "rostercore.scenario") {
        if (s && candidate.id !== s.id)
          throw new Error("Create a separate workspace for a different configuration.");
        action = "import-scenario";
        document = {
          candidate, expectedRevision: s?.revision ?? 0,
          mode: s ? "REPLACE_CURRENT" : "NEW_SCENARIO", allowHardRuleChanges: authorize,
        };
      } else if (rawRecovery) {
        if (s) throw new Error("Create an empty workspace to recover data from an older browser.");
        action = "recover-browser";
        try {
          document = {
            scenario: candidate.scenario ?? JSON.parse(String(candidate.rawScenarioStorage)),
            archives: JSON.parse(String(candidate.rawArchiveStorage ?? "[]")),
          };
        } catch {
          throw new Error("The browser data could not be read. Export a recovery copy to keep the original contents.");
        }
      } else if (format === "rostercore.workspace-backup") {
        action = "archives";
        document = { operation: "RESTORE", backup: candidate,
          expectedRevision: s?.revision ?? (candidate.scenario as Scenario | undefined)?.revision, at };
      } else if (calendarFile) {
        action = "archives";
        document = { operation: "IMPORT", archive: candidate, mode: s ? archiveMode : "RESTORE_CONTEXT",
          expectedRevision: s?.revision ?? (candidate.scenario as Scenario | undefined)?.revision, at };
      } else if (format === "rostercore.result") {
        if (!s) throw new Error("Open the original configuration before importing this older calendar.");
        action = "archives";
        document = { operation: "CREATE", id: "schedule-" + crypto.randomUUID(), result: candidate,
          createdAt: at, source: "legacy-result-import", expectedRevision: s.revision, at };
      } else throw new Error("This format is unsupported. Choose a configuration, backup, change file or saved calendar.");
      const result = await run(action, { document: action === "import-scenario" ? document : { ...document, dryRun: true },
        apply: false, quiet: true });
      if (result?.status === "PREVIEW") {
        setCompleted(false);
        setPending({ action, document, result, revision });
      } else setError(result);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const resources = async (copy: boolean, correction = false) => {
    setWorking(true);
    try {
      const mode = full ? "full" : s ? "update" : "create";
      const resources = await workspaceRequest<Record<string, unknown>>("/api/ai-resources?mode=" + mode);
      const contextResult = s && await coreAction("context", s, {}, { silent: true });
      if (contextResult && contextResult.status !== "CONTEXT") {
        setError(contextResult);
        return;
      }
      const context = contextResult?.context as { employees?: { id: string }[] } | undefined;
      if (selected?.employeeIds.length && context?.employees)
        context.employees = context.employees.filter((person) => selected.employeeIds.includes(person.id));
      const packet = {
        ...resources, format: "rostercore.ai-package", schemaVersion: 1, request,
        instructions: s
          ? "Return only a typed rostercore.scenario-change-set for the provided scenario ID, revision and hashes. Apply only the requested change. Preserve history, published assignments and unspecified fields."
          : "Return only one complete rostercore.scenario JSON document. Use the scenario schema and the example for structure. Use stable IDs and start with empty actual history and published assignments.",
        scope: selected, context,
        ...(include && s ? { scenario: s } : {}),
        ...(correction ? { diagnostics: error?.diagnostics ?? [], importError: failure || undefined } : {}),
      };
      if (copy) {
        await navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
        notifyMessage("AI package copied");
      } else download(`${s?.id ?? "new-configuration"}.ai-package.json`, packet);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const details = pending?.result.preview as { scenario?: Scenario; archiveCount?: number; historyAssignmentsAfter?: number } | undefined;
  const after = details?.scenario;
  const changes = pending?.review && s ? summarizeChanges(pending.document, s, t) : [];
  const groups = pending?.action === "import-scenario" && after ? ([
    ["employees", "People"], ["shifts", "Shift types"], ["workPatterns", "Work patterns"],
    ["dutyRequirements", "Required coverage"], ["availability", "Absences and leave"],
    ["policies", "Planning policies"], ["constraints", "Staffing rules"], ["spacingRules", "Spacing rules"],
    ["temporalRules", "Rest rules"], ["weekProfiles", "Week profiles"],
    ["allowedShifts", "Permitted shifts"], ["workPatternAssignmentRules", "Automatic work-pattern rules"],
  ] as const).flatMap(([key, label]) => {
    const before = s?.[key] ?? [];
    const items = after[key] ?? [];
    if (JSON.stringify(before) === JSON.stringify(items)) return [];
    const updated = items.filter((item) => JSON.stringify(item) !== JSON.stringify(before.find((entry) => entry.id === item.id)));
    const removed = before.filter((item) => !items.some((entry) => entry.id === item.id));
    return [{
      label: t(label), count: items.length, before: before.length,
      details: [
        ...updated.map((item) => t("Added or updated {name}", { name: "label" in item ? item.label ?? item.id : item.id })),
        ...removed.map((item) => t("Removed {name}", { name: "label" in item ? item.label ?? item.id : item.id })),
      ],
    }];
  }) : [];

  return (
    <section className={importOnly ? "form-surface document-import" : "panel ai-configuration"}>
      {showHeading && <h2>{t(importOnly ? "Import a file" : "Create or update configuration with AI")}</h2>}
      {!importOnly && <>
        <p>{t("Prepare a package for your AI assistant, then review the reply here.")}</p>
        <label className="field">
          <span>{t(s ? "What would you like to change?" : "What do you need to plan?")}</span>
          <textarea rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
        </label>
        <div className="row">
          <button className="primary" disabled={busy || working || !request.trim()} onClick={() => resources(true)}>{t("Copy AI package")}</button>
          <button disabled={busy || working || !request.trim()} onClick={() => resources(false)}>{t("Download AI package")}</button>
        </div>
        <details>
          <summary>{t("AI package options")}</summary>
          <label><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />{t("Include all guides, schemas and examples")}</label>
          {s && <label><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />{t("Include the full current scenario and personal data")}</label>}
        </details>
      </>}
      <div className={importOnly ? "import-fields" : "form-group import-fields"}>
        {!importOnly && <h3>{t("Review the AI reply")}</h3>}
        <label className="field file-field">
          <span>{t(importOnly ? "Choose a RosterCore file" : "Choose a configuration file")}</span>
          <input type="file" accept="application/json,.json" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            resetImport();
            setFilename(file.name);
            if (file.size > 8 * 1024 * 1024) {
              setText("");
              setFailure("Input exceeds 8 MiB");
              return;
            }
            try { setText(await file.text()); }
            catch { setText(""); setFailure("This file could not be read. Choose a RosterCore export or check the pasted text."); }
          }} />
        </label>
        {filename && <p className="selected-file"><Icon name="check" />{filename}{formatLabel && <> · {t(formatLabel)}</>}</p>}
        <details>
          <summary>{t(importOnly ? "Paste file contents" : "Paste a JSON answer")}</summary>
          <label className="field">
            <span>{t(importOnly ? "File contents" : s ? "Complete scenario or scenario change-set JSON" : "Complete scenario JSON")}</span>
            <textarea rows={6} value={text} onChange={(e) => { setFilename(""); setText(e.target.value); resetImport(); }} />
          </label>
        </details>
        {s && (format === "rostercore.scenario" || (format === "rostercore.scenario-change-set" && candidate?.allowHardRuleChanges === true)) &&
          <label><input type="checkbox" checked={authorize} onChange={(e) => { setAuthorize(e.target.checked); setPending(undefined); }} />
            {t("Explicitly authorize changes to calendar, definitions and hard rules")}
          </label>}
        {s && calendarFile && <Select label={t("What do you want to recover?")} value={archiveMode}
          options={[
            { id: "REFERENCE", label: t("Keep as a reference calendar") },
            { id: "PUBLISH", label: t("Continue a published plan") },
            { id: "COMPLETE", label: t("Resume from work already completed") },
            { id: "RESTORE_CONTEXT", label: t("Recover the original configuration") },
          ]} onChange={(value) => { setArchiveMode(value); setPending(undefined); setError(undefined); }} />}
        <button className="primary" disabled={busy || working || !text.trim()} onClick={() => preview()}>
          {t(importOnly ? "Review import" : "Validate and preview configuration")}
        </button>
      </div>
      {(error || failure) && <div role="alert" className="notice">
        <p>{failure ? t(failure) : t("The file could not be imported. Check the details before trying again.")}</p>
        <details>
          <summary>{t("Technical details")}</summary>
          {failure && <p>{failure}</p>}
          {error?.diagnostics.map((entry, i) => <p key={i}>
            <code>{entry.code} {entry.path}</code><br />
            {diagnostic(entry)}{diagnostic(entry) !== entry.message && <><br />{entry.message}</>}
          </p>)}
        </details>
        {!importOnly && <button disabled={working} onClick={() => resources(true, true)}>{t("Copy diagnostics and AI context")}</button>}
        {official && error?.diagnostics.some((entry) => ["PROTECTED_ASSIGNMENT", "CLOSURE_PROTECTED_CONFLICT"].includes(entry.code)) &&
          <button disabled={working} onClick={() => preview(true)}>{t("Preview as a revision proposal")}</button>}
      </div>}
      {pending && <ReviewDialog title={t(pending.action === "archives" || pending.action === "recover-browser" ?
        "Review import" : "Review configuration changes")} onCancel={() => setPending(undefined)}
        confirmLabel={t(replacement ? "Restore workspace" : "Import and save")}
        disabled={busy || (pending.revision !== undefined && pending.revision !== revision) ||
          (pending.document.mode === "COMPLETE" && !completed)}
        onConfirm={async () => {
          const result = pending.review && s
            ? await applyReviewedChange(pending.review, s, (action, extra) => run(action, { ...extra, importFlow: true }))
            : await run(pending.action, {
                document: pending.action === "import-scenario" ? pending.document : { ...pending.document, dryRun: false },
                apply: true, quiet: true, importFlow: true,
              });
          if (result && ["IMPORTED", "RESTORED", "ARCHIVED"].includes(result.status)) {
            resetImport();
            setText("");
            setFilename("");
          } else if (result) {
            setPending(undefined);
            setError(result);
          }
        }}>
        {formatLabel && filename && <p className="hint">{filename} · {t(formatLabel)}</p>}
        {s && replacement && <p className="warning">{t("This replaces the current workspace data. Save a backup first if you want to keep a copy.")}</p>}
        {(pending.action === "archives" || pending.action === "recover-browser") && details && <>
          {after && <p><strong>{after.label}</strong></p>}
          <p>{t("Calendars after import: {count}", { count: details.archiveCount ?? 0 })}</p>
          <p>{t("Confirmed assignments after import: {count}", { count: details.historyAssignmentsAfter ?? 0 })}</p>
        </>}
        {pending.document.mode === "COMPLETE" && <label>
          <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
          {t("I confirm these shifts were actually worked")}
        </label>}
        {pending.action === "import-scenario" && after && <>
          <p><strong>{after.label}</strong></p>
          <p>{t("Planning period {start} to {end}", { start: after.calendar.start, end: after.calendar.end })}</p>
          <dl className="config-summary">
            {groups.map((group) => <div key={group.label}>
              <dt>{group.label}</dt><dd>{s ? `${group.before} → ${group.count}` : group.count}</dd>
            </div>)}
          </dl>
          {groups.length > 0 && <details>
            <summary>{t("Review changed items")}</summary>
            <ul className="change-summary">{groups.flatMap((group) => group.details).map((line, i) => <li key={i}>{line}</li>)}</ul>
          </details>}
        </>}
        {changes.length > 0 && <ul className="change-summary">{changes.map((line, i) => <li key={i}>{line}</li>)}</ul>}
        {pending.review?.proposal && <p className="notice">{t("This creates a future revision proposal. The original publication remains official until its replacement is explicitly published.")}</p>}
        {(pending.result.preview as { historyRebuildRequired?: boolean })?.historyRebuildRequired &&
          <p className="warning">{t("These fairness changes require an explicit historical snapshot rebuild from original dated context before generation. Actual assignments remain preserved.")}</p>}
        <details><summary>{t("Technical preview")}</summary><pre>{JSON.stringify(pending.document, null, 2)}</pre></details>
      </ReviewDialog>}
    </section>
  );
}
