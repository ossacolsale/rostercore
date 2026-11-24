import { useEffect, useId, useRef, useState } from "react";
import { AIConfiguration } from "./ai-configuration";
import type { Run } from "./api";
import { ScheduleLibrary, type ArchiveRequest } from "./archives";
import { CalendarWorkspace } from "./calendar-workspace";
import { Icon } from "./icons";
import { LanguageSelector, useI18n } from "./i18n";
import { download, planningSignature, type Result } from "./model";
import { notifyError, notifyResult } from "./notifications";
import { People } from "./people";
import { ReviewDialog } from "./review-dialog";
import { calendarToday } from "./work-completion";
import { BrowserRecovery, WorkspaceFiles, workspaceName, type LocationTask } from "./workspace-files";
import { type Location, type Workspace, WorkspaceError, workspaceRequest } from "./workspace";

const sections = [["calendar", "Calendar"], ["people", "People"], ["configuration", "Configuration"], ["archive", "Archive"]] as const;
type Section = typeof sections[number][0];
type Destination = Section | "start" | "place";
type Screen =
  | { view: "place" | "start" }
  | { view: "section"; section: Section }
  | { view: "import" | "ai" | "recover"; back: Destination }
  | { view: "location"; task: LocationTask; back: Destination };

const destination = (value: Destination): Screen =>
  value === "place" || value === "start" ? { view: value } : { view: "section", section: value };

function initialScreen(location: Location, workspace?: Workspace): Screen {
  return destination(workspace?.scenario ? "calendar" : location.selected ? "start" : "place");
}

function Choice({ icon, title, hint, onClick, disabled }: {
  icon: Parameters<typeof Icon>[0]["name"]; title: string; hint?: string;
  onClick: () => void; disabled?: boolean;
}) {
  const description = useId();
  return <button className="choice" onClick={onClick} disabled={disabled} aria-label={title} aria-describedby={hint ? description : undefined}>
    <span className="choice-icon"><Icon name={icon} /></span>
    <span className="choice-text"><strong>{title}</strong>{hint && <small id={description}>{hint}</small>}</span>
    <Icon name="arrow" />
  </button>;
}

export default function App() {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [demo, setDemo] = useState<Workspace>();
  const [location, setLocation] = useState<Location>();
  const [screen, setScreen] = useState<Screen>();
  const main = useRef<HTMLElement>(null);
  const go = (value: Destination) => setScreen(destination(value));
  const openImport = (back: Destination) => setScreen({ view: "import", back });
  const openLocation = (task: LocationTask, back: Destination) => setScreen({ view: "location", task, back });
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
  const activeSection = screen?.view === "section" ? screen.section :
    screen && "back" in screen && screen.back !== "place" && screen.back !== "start" ? screen.back : undefined;
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
    setScreen(initialScreen(location, workspace));
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
      setScreen((current) => !current || (workspace && (workspace.id !== loaded.id ||
        Boolean(workspace.scenario) !== Boolean(loaded.scenario))) ? initialScreen(location, loaded) : current);
      setStatus(undefined);
      setSelected(undefined);
      setPending(undefined);
      setLastRun(undefined);
      setReset((n) => n + 1);
    } catch (error) {
      onError(error);
      setScreen((current) => current ?? { view: "place" });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (!screen) return;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [screen]);
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
        if (workspace.scenario && (!scenario || extra.importFlow || result.status === "RESTORED")) {
          setSelected(undefined);
          setPending(undefined);
          setLastRun(undefined);
          setPrevious(undefined);
          setReset((n) => n + 1);
          go("calendar");
        } else if (workspace.activeArchiveId !== active.activeArchiveId) {
          setPrevious(archive?.result);
          setSelected(undefined);
          setLastRun(undefined);
          go("calendar");
        }
      }
      setStatus(undefined);
      if (["solve", "regenerate", "improve"].includes(action) || result.generationFailure)
        setLastRun(result.generationFailure ?? (!workspace ? result : undefined));
      if (result.restoredSchedule) {
        setSelected(result.restoredSchedule.archiveId);
        setLastRun(undefined);
        go("calendar");
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
      go("calendar");
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

  let content;
  if (screen?.view === "location" && location) {
    const title = { create: "New workspace", open: "Open workspace", connect: "Connect to a shared workspace", manage: "Workspace and backups" }[screen.task];
    content = <>
      <button className="quiet back-button" onClick={() => go(screen.back)}><Icon name="back" />{t("Back")}</button>
      <h1>{t(title)}</h1>
      <WorkspaceFiles key={`${reset}-${screen.task}`} workspace={workspace}
        location={location} task={screen.task} busy={busy} onLocation={onLocation} onDemo={beginDemo}
        onChoose={(task) => openLocation(task, screen.back)} />
    </>;
  } else if (screen?.view === "place" || screen?.view === "start") {
    const place = screen.view === "place";
    content = <section className="welcome">
      <div className="welcome-intro">
        <div className="welcome-mark"><Icon name={place ? "folder" : "calendar"} /></div>
        <h1>{t(place ? "Where do you want to work?" : "How do you want to start?")}</h1>
        <p>{t(place ? "Choose where RosterCore will save your people, schedules and history." : "Your workspace is ready. Bring in existing data or create a configuration.")}</p>
        {!place && <button className="quiet" onClick={() => go("place")}><Icon name="back" />{t("Change workspace")}</button>}
      </div>
      <div className="welcome-actions">
        {place ? <>
          {!location && <button onClick={reload} disabled={busy}>{t("Reload workspace")}</button>}
          {location?.mode === "LOCAL" && <>
            <Choice icon="plus" title={t("New workspace")} hint={t("Save a workspace file on this computer.")} onClick={() => openLocation("create", "place")} />
            <Choice icon="folder" title={t("Open workspace")} hint={t("Continue from an existing workspace file.")} onClick={() => openLocation("open", "place")} />
            <Choice icon="link" title={t("Connect to a shared workspace")} hint={t("Join a workspace hosted by your team.")} onClick={() => openLocation("connect", "place")} />
          </>}
          {location && location.mode !== "LOCAL" && <Choice icon="folder" title={t("Workspace and backups")} onClick={() => openLocation("manage", "place")} />}
          {active && location?.selected && !location.warning &&
            <Choice icon="calendar" title={t("Use this workspace")} onClick={() => setScreen(initialScreen(location, active))} />}
          <Choice icon="demo" title={t("Try an isolated demo")} hint={t("Explore sample schedules in a temporary workspace.")} disabled={busy} onClick={beginDemo} />
        </> : <>
          <Choice icon="archive" title={t("Recover previous data")} hint={t("Restore a backup or recover data stored by an older version.")} onClick={() => setScreen({ view: "recover", back: "start" })} />
          <Choice icon="upload" title={t("Import a file")} hint={t("Review a configuration, backup or calendar before saving.")} onClick={() => openImport("start")} />
          <Choice icon="spark" title={t("Create a configuration with AI")} hint={t("Prepare a request for an assistant of your choice.")} onClick={() => setScreen({ view: "ai", back: "start" })} />
        </>}
      </div>
    </section>;
  } else if (screen?.view === "recover") {
    content = <><button className="quiet back-button" onClick={() => go(screen.back)}><Icon name="back" />{t("Back")}</button>
      <h1>{t("Recover previous data")}</h1>
      <BrowserRecovery run={run} busy={busy} onImport={() => openImport(screen.back)} /></>;
  } else if (active && (screen?.view === "ai" || screen?.view === "import")) {
    content = <div className="reading-width">
      <button className="quiet back-button" onClick={() => go(screen.back)}><Icon name="back" />{t("Back")}</button>
      <h1>{t(screen.view === "import" ? "Import a file" : "Create a configuration with AI")}</h1>
      <AIConfiguration key={reset} s={scenario} run={run} busy={busy} archives={archives}
        revision={active.revision} importOnly={screen.view === "import"} showHeading={false} />
    </div>;
  } else if (scenario && screen?.view === "section") {
    switch (screen.section) {
      case "calendar":
        content = <CalendarWorkspace key={reset} s={archive?.scenario ?? scenario} r={lastRun ?? archive?.result} archive={archive}
          archives={archives} currentScenario={scenario} previous={previous} stale={stale} busy={busy}
          run={calendarRun} validated onConfigure={() => go("people")}
          publish={() => archive && void reviewArchive({ operation: "PUBLISH", id: archive.id })} />;
        break;
      case "people":
        content = <People key={reset} s={scenario} archives={archives} archive={recent} run={run} />;
        break;
      case "configuration":
        content = <>
          <div className="page-heading"><h1>{t("Configuration")}</h1><div className="row">
            <button onClick={() => download(`${scenario.id}.json`, scenario)}><Icon name="download" />{t("Export configuration JSON")}</button>
            <button className="primary" onClick={() => openImport("configuration")}><Icon name="upload" />{t("Import a file")}</button>
          </div></div>
          <div className="configuration-layout">
            <section className="panel">
              <h2>{t("Current rules")}</h2>
              <p className="hint">{t("Planning period {start} to {end}", { start: scenario.calendar.start, end: scenario.calendar.end })}</p>
              <dl className="config-summary">
                <dt>{t("People")}</dt><dd>{scenario.employees.length}</dd>
                <dt>{t("Shift types")}</dt><dd>{scenario.shifts.filter((shift) => shift.kind === "WORKING").map((shift) => shift.label).join(", ") || "—"}</dd>
                <dt>{t("Required coverage")}</dt><dd>{scenario.dutyRequirements?.map((rule) => rule.label).join(", ") || "—"}</dd>
                <dt>{t("Planning policies")}</dt><dd>{scenario.policies.filter((policy) => policy.active && !policy.draft).map((policy) => policy.label).join(", ") || "—"}</dd>
              </dl>
              <button disabled={busy} onClick={() => run("validate")}>{t("Validate configuration")}</button>
            </section>
            <AIConfiguration key={reset} s={scenario} run={run} busy={busy} archives={archives} revision={active?.revision} />
          </div>
        </>;
        break;
      case "archive":
        content = <>
          <div className="page-heading"><h1>{t("Archive")}</h1><div className="row">
            {!demo && location && <button onClick={() => openLocation("manage", "archive")}><Icon name="folder" />{t("Workspace and backups")}</button>}
            <button className="primary" onClick={() => openImport("archive")}><Icon name="upload" />{t("Import a file")}</button>
          </div></div>
          <ScheduleLibrary key={reset} s={scenario} archives={archives} activeId={archive?.id} run={run}
            comparisonScenarioId={archive?.scenarioId} onCompare={(result) => {
              setPrevious(result);
              go("calendar");
            }} />
        </>;
        break;
    }
  }
  const activeName = location && !location.warning && workspaceName(location);
  const localStatus = status === "offline" ? "Disconnected" : status === "conflict" ? "Workspace conflict" :
    location?.mode === "CLIENT" ? "Connected to shared workspace" :
    location?.mode === "HOST" ? "Sharing on the LAN" : "Local workspace";

  return (
    <div className="desktop-app">
      <a className="skip-link" href="#main-content">{t("Skip to main content")}</a>
      <header className="desktop-header">
        <div className="app-bar">
          <div className="desktop-brand"><span className="logo-mark"><Icon name="calendar" /></span><strong>RosterCore</strong></div>
          {scenario && <nav aria-label={t("Workspace sections")}>
            {sections.map(([id, label]) => <button key={id} aria-current={activeSection === id ? "page" : undefined}
              onClick={() => go(id)}><Icon name={id} />{t(label)}</button>)}
          </nav>}
          <LanguageSelector />
        </div>
        {(scenario || location?.selected) && <div className="workspace-bar">
          <div className="workspace-identity">
            <Icon name={demo || location?.mode !== "CLIENT" ? "folder" : "link"} />
            <strong>{scenario?.label ?? activeName}</strong>
            {!demo && scenario && activeName && <button className="workspace-file quiet" onClick={() => openLocation("manage", activeSection ?? "calendar")}>{activeName}</button>}
            {!demo && !scenario && activeName && location?.mode !== "CLIENT" && <span className="workspace-path">{location?.location}</span>}
          </div>
          <div className="workspace-status">
            <span className={status && !demo ? "connection issue" : "connection"} role="status">
              {t(demo ? "Isolated demo" : busy ? "Working…" : localStatus)}
            </span>
            {!demo && Boolean(active?.revision) && !busy && !status && <span className="save-status"><Icon name="check" />{t("Saved")}</span>}
            {demo ? <button className="quiet" disabled={busy} onClick={() => {
              setDemo(undefined); setLastRun(undefined); setSelected(undefined);
              setPrevious(undefined); setPending(undefined); setReset((n) => n + 1);
              setScreen(location ? initialScreen(location, workspace) : { view: "place" });
            }}>{t("Exit demo")}</button> :
              (status || location?.mode === "CLIENT") &&
              <button className="quiet" disabled={busy} onClick={reload}>{t("Reload workspace")}</button>}
          </div>
        </div>}
      </header>
      <main ref={main} tabIndex={-1} className="desktop-workspace" id="main-content">
        {location?.warning && !demo && <p role="alert" className="warning">{t(location.warning)}</p>}
        {status === "conflict" && !demo && <p role="alert" className="warning">{t("Someone saved a newer version. Close the review, reload and preview your changes again.")}</p>}
        {content ?? <p role="status">{t("Loading your local workspace…")}</p>}
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
