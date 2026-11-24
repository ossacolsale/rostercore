import { useEffect, useRef, useState } from "react";
import { AIConfiguration } from "./ai-configuration";
import type { Run } from "./api";
import { ScheduleLibrary, type ArchiveRequest } from "./archives";
import { CalendarWorkspace } from "./calendar-workspace";
import { LanguageSelector, useI18n } from "./i18n";
import { download, planningSignature, type Result } from "./model";
import { notifyError, notifyResult } from "./notifications";
import { People } from "./people";
import { ReviewDialog } from "./review-dialog";
import { calendarToday } from "./work-completion";
import { WorkspaceFiles } from "./workspace-files";
import { type Location, type Workspace, WorkspaceError, workspaceRequest } from "./workspace";

const sections = [["calendar", "Calendar"], ["people", "People"], ["configuration", "Configuration"], ["archive", "Archive"]] as const;
type Section = typeof sections[number][0];
type Setup = "ai" | "json" | "file";

export default function App() {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [demo, setDemo] = useState<Workspace>();
  const [location, setLocation] = useState<Location>();
  const [section, setSection] = useState<Section>("calendar");
  const [setup, setSetup] = useState<Setup>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [status, setStatus] = useState<"offline" | "conflict" | undefined>();
  const [reset, setReset] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [lastRun, setLastRun] = useState<Result>();
  const [previous, setPrevious] = useState<Result>();
  const [pending, setPending] = useState<ArchiveRequest>();
  const [actualConfirmed, setActualConfirmed] = useState(false);
  const active = demo ?? workspace;
  const scenario = active?.scenario ?? undefined;
  const archives = active?.archives ?? [];
  const recent = archives.find((item) => item.id === active?.activeArchiveId) ??
    [...archives].reverse().find((item) => item.scenarioId === scenario?.id && item.state !== "SUPERSEDED");
  const archive = archives.find((item) => item.id === selected) ?? recent;

  const onError = (error: unknown) => {
    if (error instanceof WorkspaceError) {
      if (error.status === 409) setStatus("conflict");
      if (error.status === 503) setStatus("offline");
    }
    notifyError((error as Error).message);
  };
  const onLocation = (location: Location, workspace: Workspace) => {
    setLocation(location);
    setWorkspace(workspace);
    setStatus(undefined);
    setSelected(undefined);
    setLastRun(undefined);
    setPrevious(undefined);
    setPending(undefined);
    setReset((n) => n + 1);
    if (workspace.scenario) setSection("calendar");
  };
  const reload = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const location = await workspaceRequest<Location>("/api/workspace/location");
      setLocation(location);
      const loaded = await workspaceRequest<Workspace>("/api/workspace");
      setWorkspace(loaded);
      setStatus(undefined);
      setSelected(undefined);
      setPending(undefined);
      setLastRun(undefined);
      setReset((n) => n + 1);
    } catch (error) {
      onError(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (location?.mode !== "CLIENT" || demo) return;
    const timer = window.setInterval(async () => {
      try {
        await workspaceRequest("/api/workspace/status");
        setStatus((current) => current === "offline" ? undefined : current);
      } catch (error) {
        if (error instanceof WorkspaceError)
          setStatus((current) => current === "conflict" ? current : "offline");
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [location, demo]);

  const run: Run = async (action, extra = {}) => {
    if (!active || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const { result, workspace } = await workspaceRequest<{ result: Result & { generationFailure?: Result }; workspace?: Workspace }>(
        demo ? "/api/demo" : "/api/workspace/run", {
          ...extra, action, archiveId: archive?.id,
          expected: { id: active.id, revision: active.revision, session: active.session },
          ...(demo ? { snapshot: active } : {}),
        });
      if (workspace) {
        (demo ? setDemo : setWorkspace)(workspace);
        if (!scenario && workspace.scenario) {
          setSetup(undefined);
          setSection("calendar");
        }
        if (workspace.activeArchiveId !== active.activeArchiveId) {
          setPrevious(archive?.result);
          setSelected(undefined);
          setLastRun(undefined);
          setSection("calendar");
        }
      }
      setStatus(undefined);
      if (["solve", "regenerate", "improve"].includes(action) || result.generationFailure)
        setLastRun(result.generationFailure ?? (!workspace ? result : undefined));
      if (result.restoredSchedule) {
        setSelected(result.restoredSchedule.archiveId);
        setLastRun(undefined);
        setSection("calendar");
      }
      if (!extra.quiet) notifyResult(result.generationFailure ?? result, action);
      return result;
    } catch (error) {
      onError(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  async function beginDemo() {
    setBusy(true);
    try {
      setDemo(await workspaceRequest<Workspace>("/api/demo", {}));
      setSection("calendar");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  const archiveOperation = async (operation: ArchiveRequest, dryRun: boolean) => {
    if (!scenario) return;
    return run("archives", { document: {
      ...operation, dryRun, expectedRevision: scenario.revision, at: new Date().toISOString(),
    } });
  };
  const reviewArchive = async (operation: ArchiveRequest) => {
    const result = await archiveOperation(operation, true);
    if (result?.status === "PREVIEW") {
      setActualConfirmed(false);
      setPending(operation);
    }
    return result;
  };
  const calendarRun: Run = (action, extra) => action === "consolidate" && archive
    ? reviewArchive({ operation: "COMPLETE", id: archive.id, through: extra?.through })
    : run(action, extra);
  const stale = !!(scenario && archive) && planningSignature(scenario, archive.result) !== planningSignature(archive.scenario, archive.result);

  return (
    <div className="desktop-app">
      <header className="desktop-header">
        <div className="desktop-brand"><span className="logo-mark" aria-hidden="true">R</span><strong>RosterCore</strong></div>
        {scenario && <nav aria-label={t("Workspace sections")}>
          {sections.map(([id, label]) => <button key={id} aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id)}>{t(label)}</button>)}
        </nav>}
        <LanguageSelector />
      </header>
      <main className="desktop-workspace" id="main-content">
        <div className="workspace-caption">
          {scenario && <strong>{scenario.label}</strong>}
          <div className="row workspace-status">
            <span role="status">
              {demo ? t("Isolated demo") : busy ? t("Working…") :
                status === "offline" ? t("Disconnected") : status === "conflict" ? t("Workspace conflict") :
                location ? t({ LOCAL: "Local workspace", HOST: "Sharing on the LAN", CLIENT: "Connected to shared workspace" }[location.mode]) : ""}
            </span>
            {!demo && Boolean(active?.revision) && !busy && !status && <span>{t("Saved")}</span>}
            {demo ? <button disabled={busy} onClick={() => {
              setDemo(undefined);
              setLastRun(undefined);
              setSelected(undefined);
              setPrevious(undefined);
              setPending(undefined);
            }}>{t("Exit demo")}</button> :
              (status || location?.mode === "CLIENT") &&
              <button disabled={busy} onClick={reload}>{t("Reload workspace")}</button>}
          </div>
        </div>
        {location?.warning && !demo && <p role="alert" className="warning">{t(location.warning)}</p>}
        {status === "conflict" && !demo && <p role="alert" className="warning">{t("Someone saved a newer version. Close the review, reload and preview your changes again.")}</p>}
        {!active && <p>{t(busy ? "Loading your local workspace…" : "Open a workspace to begin.")}</p>}
        {!active && location && <button onClick={() => {
          setWorkspace({ id: "", revision: 0, scenario: null, archives: [], activeArchiveId: null });
          setSetup("file");
        }}>{t("Workspace and backups")}</button>}
        {active && !scenario && !setup && <section className="panel welcome">
          <h1>{t("Set up your workspace")}</h1>
          <div className="welcome-actions">
            <button className="primary" disabled={Boolean(location?.warning)} onClick={() => setSetup("ai")}>{t("Create a configuration with AI")}</button>
            <button disabled={Boolean(location?.warning)} onClick={() => setSetup("json")}>{t("Import a JSON configuration")}</button>
            <button onClick={() => setSetup("file")}>{t("Open a local or shared workspace")}</button>
            <button disabled={busy} onClick={beginDemo}>{t("Try an isolated demo")}</button>
          </div>
        </section>}
        {active && !scenario && setup && <button className="back-button" onClick={() => setSetup(undefined)}>{t("Back")}</button>}
        {active && location && ((!scenario && setup === "file") || (scenario && section === "archive" && !demo)) &&
          <WorkspaceFiles key={reset} workspace={active} location={location} busy={busy} onLocation={onLocation} run={run} />}
        {active && !scenario && (setup === "ai" || setup === "json") &&
          <AIConfiguration run={run} busy={busy} revision={active.revision} importOnly={setup === "json"} />}
        {scenario && section === "calendar" &&
          <CalendarWorkspace key={reset} s={archive?.scenario ?? scenario} r={lastRun ?? archive?.result} archive={archive}
            archives={archives} currentScenario={scenario} previous={previous} stale={stale} busy={busy}
            run={calendarRun} validated onConfigure={() => setSection("people")}
            publish={() => archive && void reviewArchive({ operation: "PUBLISH", id: archive.id })} />}
        {scenario && section === "people" &&
          <People key={reset} s={scenario} archives={archives} archive={recent} run={run} />}
        {scenario && section === "configuration" && <>
          <section className="panel">
            <div className="calendar-heading"><h2>{t("Configuration")}</h2>
              <button onClick={() => download(`${scenario.id}.json`, scenario)}>{t("Export configuration JSON")}</button>
            </div>
            <p>{t("Planning period {start} to {end}", { start: scenario.calendar.start, end: scenario.calendar.end })}</p>
            <dl className="config-summary">
              <dt>{t("People")}</dt><dd>{scenario.employees.length}</dd>
              <dt>{t("Shift types")}</dt><dd>{scenario.shifts.filter((shift) => shift.kind === "WORKING").map((shift) => shift.label).join(", ") || "—"}</dd>
              <dt>{t("Required coverage")}</dt><dd>{scenario.dutyRequirements?.map((rule) => rule.label).join(", ") || "—"}</dd>
              <dt>{t("Planning policies")}</dt><dd>{scenario.policies.filter((policy) => policy.active && !policy.draft).map((policy) => policy.label).join(", ") || "—"}</dd>
            </dl>
            <button disabled={busy} onClick={() => run("validate")}>{t("Validate configuration")}</button>
          </section>
          <AIConfiguration s={scenario} run={run} busy={busy} archives={archives} revision={active?.revision} />
        </>}
        {scenario && section === "archive" &&
          <ScheduleLibrary key={reset} s={scenario} archives={archives} activeId={archive?.id} run={run}
            comparisonScenarioId={archive?.scenarioId} onCompare={(result) => {
              setPrevious(result);
              setSection("calendar");
            }} />}
        {pending && <ReviewDialog title={t("Confirm calendar operation")} disabled={busy || (pending.operation === "COMPLETE" && !actualConfirmed)}
          onCancel={() => setPending(undefined)} onConfirm={async () => {
            const result = await archiveOperation(pending, false);
            if (result?.status === "PUBLISHED" || result?.status === "CONSOLIDATED") setPending(undefined);
          }}>
          <p>{t(pending.operation === "PUBLISH"
            ? "Publish this calendar as the official plan."
            : "Record only the work that was actually completed through the selected date.")}</p>
          {typeof pending.through === "string" && <p>{pending.through}</p>}
          {pending.operation === "COMPLETE" && <label>
            <input type="checkbox" checked={actualConfirmed} onChange={(event) => setActualConfirmed(event.target.checked)} />
            {t("I confirm these shifts were actually worked")}
          </label>}
          {scenario && String(pending.through ?? "") > calendarToday(scenario.calendar.timezone) &&
            <p className="warning">{t("Future work cannot be confirmed as completed. Choose a date on or before today.")}</p>}
        </ReviewDialog>}
      </main>
    </div>
  );
}
