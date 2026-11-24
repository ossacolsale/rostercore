import { useState } from "react";
import type { Run } from "./api";
import { Icon } from "./icons";
import { useI18n } from "./i18n";
import { download } from "./model";
import { notifyError, notifyMessage } from "./notifications";
import { ReviewDialog } from "./review-dialog";
import { type Location, type Revision, type Workspace, workspaceRequest } from "./workspace";

export type LocationTask = "create" | "open" | "connect" | "manage";
type FileOperation = "CREATE" | "OPEN" | "BACKUP";

export function workspaceName(location: Location) {
  return location.location === ":memory:" || location.mode === "CLIENT"
    ? location.mode === "CLIENT" ? location.location : ""
    : location.location.split(/[\\/]/).pop() ?? "";
}

export function WorkspaceFiles({ workspace, location, task, busy, onLocation, onChoose, onDemo }: {
  workspace?: Workspace;
  location: Location;
  task: LocationTask;
  busy: boolean;
  onLocation: (location: Location, workspace: Workspace) => void;
  onChoose?: (task: LocationTask) => void;
  onDemo?: () => void;
}) {
  const { t, locale, localizeError } = useI18n();
  const [filePath, setFilePath] = useState("");
  const [restoreSource, setRestoreSource] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [certificate, setCertificate] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>();
  const defaultFile = task === "create" && !location.selected && !location.warning &&
    location.location !== ":memory:" && workspace && !workspace.scenario ? location.location : undefined;

  const control = async (body: Record<string, unknown>, backup = false) => {
    setWorking(true);
    setFailure("");
    try {
      if (backup) {
        await workspaceRequest("/api/workspace/backup-file", body);
        notifyMessage("SQLite backup saved");
      } else {
        const result = await workspaceRequest<Location & { workspace: Workspace }>("/api/workspace/location", body);
        onLocation(result, result.workspace);
      }
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const choose = async (operation: FileOperation) => {
    try {
      const path = window.rosterCore ? await window.rosterCore.chooseFile(operation, defaultFile?.replace(/workspace\.sqlite$/i, "RosterCore.sqlite")) : filePath.trim();
      if (path) await control({ operation, path }, operation === "BACKUP");
    } catch (error) {
      setFailure((error as Error).message);
    }
  };
  const restoreFile = async () => {
    try {
      const source = window.rosterCore ? await window.rosterCore.chooseFile("OPEN") : restoreSource.trim();
      if (!source) return;
      const path = window.rosterCore ? await window.rosterCore.chooseFile("CREATE") : filePath.trim();
      if (path) await control({ operation: "RESTORE", source, path });
    } catch (error) {
      setFailure((error as Error).message);
    }
  };
  const loadRevisions = async () => {
    try {
      setRevisions(await workspaceRequest<Revision[]>("/api/workspace/revisions"));
    } catch (error) {
      setFailure((error as Error).message);
    }
  };
  const pathField = (label: string) => !window.rosterCore &&
    <label className="field"><span>{t(label)}</span><input value={filePath}
      placeholder={defaultFile ?? undefined} onChange={(e) => setFilePath(e.target.value)} /></label>;

  return (
    <section className={task === "manage" ? "workspace-management" : "form-surface"}>
      <fieldset disabled={busy || working} className="bare-fields">
        {task === "create" && <>
          {defaultFile && <div className="location-summary">
            <Icon name="folder" /><div><strong>{t("Suggested destination")}</strong><span>{defaultFile}</span></div>
          </div>}
          {pathField("Choose a different file location")}
          <div className="row">
            {defaultFile && <button className="primary" onClick={() => control({ operation: "OPEN", path: defaultFile })}>
              {t("Use suggested destination")}
            </button>}
            <button className={defaultFile ? undefined : "primary"} disabled={!window.rosterCore && !filePath.trim()}
              onClick={() => choose("CREATE")}>{t(defaultFile ? "Choose another location" : "Create workspace")}</button>
          </div>
        </>}
        {task === "open" && <>
          {pathField("Workspace file path")}
          <button className="primary" disabled={!window.rosterCore && !filePath.trim()} onClick={() => choose("OPEN")}>
            <Icon name="folder" />{t("Open workspace file")}
          </button>
        </>}
        {task === "connect" && <>
          <p>{t("Ask the host for the address and access token.")}</p>
          <label className="field"><span>{t("Shared workspace address")}</span>
            <input type="url" value={url} placeholder="https://192.168.1.10:4319" onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field"><span>{t("Shared access token")}</span>
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          <details><summary>{t("Private certificate")}</summary>
            <label className="field"><span>{t("Host trust certificate (PEM)")}</span>
              <textarea rows={3} value={certificate} onChange={(e) => setCertificate(e.target.value)} />
            </label>
          </details>
          <button className="primary" disabled={!url.trim() || !token}
            onClick={() => control({ operation: "CONNECT", url: url.trim(), token, certificate })}>{t("Connect")}</button>
        </>}
        {task === "manage" && <>
          <div className="location-summary">
            <Icon name={location.mode === "CLIENT" ? "link" : "folder"} />
            <div><strong>{workspaceName(location) || t("Local workspace")}</strong>
              {location.location !== ":memory:" && <span>{location.location}</span>}</div>
          </div>
          <div className="row">
            {location.mode === "LOCAL" && <>
              <button onClick={() => onChoose?.("open")}>{t("Open workspace")}</button>
              <button onClick={() => onChoose?.("create")}>{t("New workspace")}</button>
              <button onClick={() => onChoose?.("connect")}>{t("Connect to a shared workspace")}</button>
            </>}
            {location.mode === "CLIENT" &&
              <button onClick={() => control({ operation: "DISCONNECT" })}>{t("Return to local workspace")}</button>}
            {onDemo && <button className="quiet" onClick={onDemo}><Icon name="demo" />{t("Try an isolated demo")}</button>}
          </div>
          {location.mode !== "CLIENT" && <details>
            <summary>{t("Workspace file backups")}</summary>
            {pathField("New backup file path")}
            <button disabled={!window.rosterCore && !filePath.trim()} onClick={() => choose("BACKUP")}>{t("Save workspace backup")}</button>
            {location.mode === "LOCAL" && <details><summary>{t("Restore into a new file")}</summary>
              {!window.rosterCore && <label className="field"><span>{t("Backup file path")}</span>
                <input value={restoreSource} onChange={(e) => setRestoreSource(e.target.value)} />
              </label>}
              <p>{t("Choose the backup and a new file for the recovered workspace.")}</p>
              <button disabled={!window.rosterCore && (!filePath.trim() || !restoreSource.trim())} onClick={restoreFile}>
                {t("Restore workspace file")}
              </button>
            </details>}
          </details>}
          {workspace?.scenario && <details onToggle={(e) => {
            if (e.currentTarget.open) void loadRevisions();
          }}>
            <summary>{t("Configuration revisions")}</summary>
            {revisions?.length === 0 && <p>{t("No revisions saved yet.")}</p>}
            <ul className="revision-list">{revisions?.map((revision) => <li key={revision.revision}>
              <span>{t("Revision {number}", { number: revision.scenarioRevision })} <small>{new Date(revision.savedAt).toLocaleString(locale)}</small></span>
              <button className="quiet" onClick={async () => {
                try {
                  const scenario = await workspaceRequest(`/api/workspace/revisions/${revision.revision}`);
                  download(`${revision.scenarioId}.r${revision.scenarioRevision}.json`, scenario);
                } catch (error) { setFailure((error as Error).message); }
              }}>{t("Export configuration JSON")}</button>
            </li>)}</ul>
          </details>}
        </>}
        {working && <p role="status">{t("Working…")}</p>}
        {failure && <p className="error" role="alert">{localizeError(failure)}</p>}
      </fieldset>
    </section>
  );
}

export function BrowserRecovery({ run, busy, onImport }: { run: Run; busy: boolean; onImport: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<{ document: Record<string, unknown>; count: number }>();
  let scenario: string | null = null;
  let archives: string | null = null;
  try {
    scenario = localStorage.getItem("rostercore.scenario.v1");
    archives = localStorage.getItem("rostercore.archives.v1");
  } catch {}
  const preview = async () => {
    try {
      const document = { scenario: JSON.parse(scenario!), archives: JSON.parse(archives ?? "[]") };
      const result = await run("recover-browser", { document: { ...document, dryRun: true } });
      if (result?.status === "PREVIEW") setPending({ document, count: document.archives.length });
    } catch {
      notifyError("The browser data could not be read. Export a recovery copy to keep the original contents.");
    }
  };
  return <section className="form-surface">
    <h2>{t("Recover from a backup")}</h2>
    <button className="primary" onClick={onImport}>{t("Import a file")}</button>
    {scenario && <div className="form-group">
      <h2>{t("Data stored in this browser")}</h2>
      <div className="row">
        <button disabled={busy} onClick={preview}>{t("Recover an older browser workspace")}</button>
        <button onClick={() => download("rostercore.browser-recovery.json", {
          rawScenarioStorage: scenario, rawArchiveStorage: archives,
        })}>{t("Export browser recovery data")}</button>
      </div>
    </div>}
    {pending && <ReviewDialog title={t("Review workspace recovery")} disabled={busy}
      onCancel={() => setPending(undefined)} onConfirm={async () => {
        const result = await run("recover-browser", { document: { ...pending.document, dryRun: false } });
        if (result?.status === "RESTORED") setPending(undefined);
      }}>
      <p>{t("Calendars to recover: {count}", { count: pending.count })}</p>
    </ReviewDialog>}
  </section>;
}
