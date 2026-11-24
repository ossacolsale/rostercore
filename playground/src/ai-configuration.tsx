import { useState } from "react";
import { type Scenario, type Result, download } from "./model";
import type { Run } from "./api";
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

export function AIConfiguration({ s, run, busy, scope, archives = [], importOnly = false, revision }: {
  s?: Scenario;
  run: Run;
  busy: boolean;
  scope?: AIScope;
  archives?: ScheduleArchive[];
  importOnly?: boolean;
  revision?: number;
}) {
  const { t, diagnostic } = useI18n();
  const [text, setText] = useState("");
  const [request, setRequest] = useState("");
  const [include, setInclude] = useState(false);
  const [full, setFull] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<Result>();
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState<{
    document: Record<string, unknown>;
    result: Result;
    revision?: number;
    review?: ChangeReview;
  }>();
  const selected = scope ?? (s && { start: s.calendar.start, end: s.calendar.end, employeeIds: [], shiftIds: [], diagnostics: [] });
  const official = s && selected && proposedCalendar(s, archives, selected.start);
  const preview = async (proposal = false) => {
    setPending(undefined);
    setWorking(true);
    setError(undefined);
    setFailure("");
    try {
      if (new Blob([text]).size > 8 * 1024 * 1024) throw new Error("Input exceeds 8 MiB");
      const candidate = JSON.parse(text);
      if (candidate?.format === "rostercore.scenario-change-set" && s) {
        const document = {
          ...candidate, allowHardRuleChanges: authorize && candidate.allowHardRuleChanges === true,
        } as ChangeSet;
        const review = await reviewChange(s, document, archives,
          proposal && official && selected ? { archiveId: official.id, from: selected.start } : undefined);
        if (review.result.status === "PREVIEW")
          setPending({ document: review.document, result: review.result, revision, review });
        else setError(review.result);
      } else if (candidate?.format === "rostercore.scenario") {
        if (s && candidate.id !== s.id)
          throw new Error("Create a separate workspace for a different configuration.");
        const document = {
          candidate, expectedRevision: s?.revision ?? 0,
          mode: s ? "REPLACE_CURRENT" : "NEW_SCENARIO", allowHardRuleChanges: authorize,
        };
        const result = await run("import-scenario", { document, apply: false, quiet: true });
        if (result?.status === "PREVIEW") setPending({ document, result, revision });
        else setError(result);
      } else throw new Error(s ? "Choose a complete scenario or a typed scenario-change-set." : "Choose a complete scenario JSON file.");
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

  const after = (pending?.result.preview as { scenario?: Scenario } | undefined)?.scenario;
  const difference = pending?.review && s
    ? summarizeChanges(pending.document, s, t)
    : after ? [
      t("Load configuration for {name}", { name: after.label }),
      t("Planning period {start} to {end}", { start: after.calendar.start, end: after.calendar.end }),
      ...([
        ["employees", "People"], ["shifts", "Shift types"], ["workPatterns", "Work patterns"],
        ["dutyRequirements", "Required coverage"], ["availability", "Absences and leave"],
        ["policies", "Planning policies"], ["constraints", "Staffing rules"], ["spacingRules", "Spacing rules"],
        ["temporalRules", "Rest rules"], ["weekProfiles", "Week profiles"],
        ["allowedShifts", "Permitted shifts"], ["workPatternAssignmentRules", "Automatic work-pattern rules"],
      ] as const).flatMap(([key, label]) => {
        const before = s?.[key] ?? [];
        const items = after[key] ?? [];
        if (JSON.stringify(before) === JSON.stringify(items)) return [];
        const changed = items.filter((item) => JSON.stringify(item) !== JSON.stringify(before.find((x) => x.id === item.id)));
        const removed = before.filter((item) => !items.some((x) => x.id === item.id));
        return [
          t("{section}: {before} before, {after} after", { section: t(label), before: before.length, after: items.length }),
          ...changed.map((item) => t("Added or updated {name}", { name: "label" in item ? item.label ?? item.id : item.id })),
          ...removed.map((item) => t("Removed {name}", { name: "label" in item ? item.label ?? item.id : item.id })),
        ];
      }),
    ] : [];

  return (
    <section className="panel ai-configuration">
      <h2>{t(importOnly ? "Import a JSON configuration" : "Create or update configuration with AI")}</h2>
      {!importOnly && <>
        <p>{t("Describe your needs, share the package with an AI assistant of your choice, then review its JSON answer here.")}</p>
        <label className="field">
          <span>{t(s ? "What would you like to change?" : "What do you need to plan?")}</span>
          <textarea rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
        </label>
        <div className="row">
          <button disabled={busy || working || !request.trim()} onClick={() => resources(true)}>{t("Copy AI package")}</button>
          <button disabled={busy || working || !request.trim()} onClick={() => resources(false)}>{t("Download AI package")}</button>
        </div>
        <details>
          <summary>{t("AI package options")}</summary>
          <label><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />{t("Include all guides, schemas and examples")}</label>
          {s && <label><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />{t("Include the full current scenario and personal data")}</label>}
        </details>
      </>}
      <label className="field">
        <span>{t("Choose a configuration file")}</span>
        <input type="file" accept="application/json,.json" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            setFailure("Input exceeds 8 MiB");
            return;
          }
          setText(await file.text());
          setPending(undefined);
          setError(undefined);
          setFailure("");
        }} />
      </label>
      <details>
        <summary>{t("Paste a JSON answer")}</summary>
        <label className="field">
          <span>{t(s ? "Complete scenario or scenario change-set JSON" : "Complete scenario JSON")}</span>
          <textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setPending(undefined); }} />
        </label>
      </details>
      {s && <label>
        <input type="checkbox" checked={authorize} onChange={(e) => { setAuthorize(e.target.checked); setPending(undefined); }} />
        {t("Explicitly authorize changes to calendar, definitions and hard rules")}
      </label>}
      <button className="primary" disabled={busy || working || !text.trim()} onClick={() => preview()}>
        {t("Validate and preview configuration")}
      </button>
      {(error || failure) && <div role="alert" className="notice">
        <p>{t("Review the JSON and try again.")}</p>
        <details>
          <summary>{t("Technical details")}</summary>
          {failure && <p>{t(failure)}</p>}
          {error?.diagnostics.map((entry, i) => <p key={i}>
            <code>{entry.code} {entry.path}</code><br />
            {diagnostic(entry)}{diagnostic(entry) !== entry.message && <><br />{entry.message}</>}
          </p>)}
        </details>
        <button disabled={working} onClick={() => resources(true, true)}>{t("Copy diagnostics and AI context")}</button>
        {official && error?.diagnostics.some((entry) => ["PROTECTED_ASSIGNMENT", "CLOSURE_PROTECTED_CONFLICT"].includes(entry.code)) &&
          <button disabled={working} onClick={() => preview(true)}>{t("Preview as a revision proposal")}</button>}
      </div>}
      {pending && <ReviewDialog title={t("Review configuration changes")} onCancel={() => setPending(undefined)}
        disabled={busy || (pending.revision !== undefined && pending.revision !== revision)}
        onConfirm={async () => {
          const result = pending.review && s
            ? await applyReviewedChange(pending.review, s, run)
            : await run("import-scenario", { document: pending.document, apply: true, quiet: true });
          if (result?.status === "IMPORTED") {
            setPending(undefined);
            setText("");
          } else if (result) {
            setPending(undefined);
            setError(result);
          }
        }}>
        <ul className="change-summary">{difference.map((line, i) => <li key={i}>{line}</li>)}</ul>
        {pending.review?.proposal && <p className="notice">{t("This creates a future revision proposal. The original publication remains official until its replacement is explicitly published.")}</p>}
        {(pending.result.preview as { historyRebuildRequired?: boolean })?.historyRebuildRequired &&
          <p className="warning">{t("These fairness changes require an explicit historical snapshot rebuild from original dated context before generation. Actual assignments remain preserved.")}</p>}
        <details><summary>{t("Technical preview")}</summary><pre>{JSON.stringify(pending.document, null, 2)}</pre></details>
      </ReviewDialog>}
    </section>
  );
}
