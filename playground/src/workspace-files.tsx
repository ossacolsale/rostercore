import { useEffect, useState } from "react";
import type { Run } from "./api";
import { useI18n } from "./i18n";
import { download } from "./model";
import { notifyError, notifyMessage } from "./notifications";
import { ReviewDialog } from "./review-dialog";
import { type Location, type Revision, type Workspace, workspaceRequest } from "./workspace";

type FileOperation = "CREATE" | "OPEN" | "BACKUP";
type Restore = { document: Record<string, unknown>; action: string; preview?: Record<string, unknown> };

export function WorkspaceFiles({ workspace, location, busy, run, onLocation }: {
  workspace: Workspace;
  location: Location;
  busy: boolean;
  run: Run;
  onLocation: (location: Location, workspace: Workspace) => void;
}) {
  const { t } = useI18n();
  const [filePath, setFilePath] = useState("");
  const [restoreSource, setRestoreSource] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [certificate, setCertificate] = useState("");
  const [working, setWorking] = useState(false);
  const [restore, setRestore] = useState<Restore>();
  const [revisions, setRevisions] = useState<Revision[]>();
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    try {
      setLegacy(Boolean(localStorage.getItem("rostercore.scenario.v1")));
    } catch {}
  }, []);
  const control = async (body: Record<string, unknown>, backup = false) => {
    setWorking(true);
    try {
      if (backup) {
        await workspaceRequest("/api/workspace/backup-file", body);
        notifyMessage("SQLite backup saved");
      } else {
        const result = await workspaceRequest<Location & { workspace: Workspace }>("/api/workspace/location", body);
        onLocation(result, result.workspace);
      }
      setFilePath("");
      setRestoreSource("");
      setToken("");
    } catch (error) {
      notifyError((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const choose = async (operation: FileOperation) => {
    try {
      const path = window.rosterCore ? await window.rosterCore.chooseFile(operation) : filePath.trim();
      if (path) await control({ operation, path }, operation === "BACKUP");
    } catch (error) {
      notifyError((error as Error).message);
    }
  };
  const restoreFile = async () => {
    try {
      const source = window.rosterCore ? await window.rosterCore.chooseFile("OPEN") : restoreSource.trim();
      if (!source) return;
      const path = window.rosterCore ? await window.rosterCore.chooseFile("CREATE") : filePath.trim();
      if (path) await control({ operation: "RESTORE", source, path });
    } catch (error) {
      notifyError((error as Error).message);
    }
  };
  const previewRestore = async (action: string, document: Record<string, unknown>) => {
    const result = await run(action, { document: { ...document, dryRun: true } });
    if (result?.status === "PREVIEW") setRestore({ action, document, preview: result.preview as Record<string, unknown> });
  };
  const loadRevisions = async () => {
    try {
      setRevisions(await workspaceRequest<Revision[]>("/api/workspace/revisions"));
    } catch (error) {
      notifyError((error as Error).message);
    }
  };
  return (
    <section className="panel">
      <h2>{t("Workspace and backups")}</h2>
      {location.location !== ":memory:" && <p className="file-location">{location.location}</p>}
      <fieldset disabled={busy || working} className="workspace-file-controls">
        {location.mode !== "CLIENT" && <>
          {!window.rosterCore && <label className="field"><span>{t("Local workspace file path")}</span>
            <input value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          </label>}
          <div className="row">
            {location.mode === "LOCAL" && <>
              <button onClick={() => choose("OPEN")}>{t("Open a SQLite workspace")}</button>
              <button onClick={() => choose("CREATE")}>{t("Create a SQLite workspace")}</button>
            </>}
            <button onClick={() => choose("BACKUP")}>{t("Save a SQLite backup")}</button>
          </div>
          {location.mode === "LOCAL" && <details>
            <summary>{t("Restore a SQLite backup")}</summary>
            {!window.rosterCore && <label className="field"><span>{t("SQLite backup source path")}</span>
              <input value={restoreSource} onChange={(e) => setRestoreSource(e.target.value)} />
            </label>}
            <p>{t("Choose the backup and a new file for the recovered workspace.")}</p>
            <button onClick={restoreFile}>{t("Restore into a new file")}</button>
          </details>}
        </>}
        {location.mode === "CLIENT" && <button onClick={() => control({ operation: "DISCONNECT" })}>{t("Return to local workspace")}</button>}
        {location.mode === "LOCAL" && <details>
          <summary>{t("Connect to a shared workspace")}</summary>
          <label className="field"><span>{t("Host HTTPS address")}</span>
            <input type="url" value={url} placeholder="https://192.168.1.10:4319" onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field"><span>{t("Shared access token")}</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          <label className="field"><span>{t("Host trust certificate (PEM)")}</span>
            <textarea rows={3} value={certificate} onChange={(e) => setCertificate(e.target.value)} />
          </label>
          <button disabled={!url.trim() || !token} onClick={() => control({ operation: "CONNECT", url, token, certificate })}>
            {t("Connect")}
          </button>
        </details>}
        {!workspace.scenario && !location.warning && <>
          <label className="field"><span>{t("Restore a JSON workspace backup")}</span>
            <input type="file" accept=".json,application/json" onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > 8 * 1024 * 1024) throw new Error("Input exceeds 8 MiB");
                const backup = JSON.parse(await file.text());
                await previewRestore("archives", { operation: "RESTORE", backup, expectedRevision: backup.scenario?.revision });
              } catch (error) {
                notifyError((error as Error).message);
              }
            }} />
          </label>
          {legacy && location.mode === "LOCAL" && <button onClick={() => {
            try {
              const scenario = JSON.parse(localStorage.getItem("rostercore.scenario.v1")!);
              const archives = JSON.parse(localStorage.getItem("rostercore.archives.v1") ?? "[]");
              void previewRestore("recover-browser", { scenario, archives });
            } catch (error) {
              notifyError((error as Error).message);
            }
          }}>{t("Recover an older browser workspace")}</button>}
        </>}
        {workspace.scenario && <details onToggle={(e) => {
          if (e.currentTarget.open) void loadRevisions();
        }}>
          <summary>{t("Configuration revisions")}</summary>
          <ul>
            {revisions?.map((revision) => <li key={revision.revision}>
              {t("Revision {number}", { number: revision.scenarioRevision })} · {new Date(revision.savedAt).toLocaleString()}
              {" "}<button onClick={async () => {
                try {
                  const scenario = await workspaceRequest(`/api/workspace/revisions/${revision.revision}`);
                  download(`${revision.scenarioId}.r${revision.scenarioRevision}.json`, scenario);
                } catch (error) {
                  notifyError((error as Error).message);
                }
              }}>{t("Export configuration JSON")}</button>
            </li>)}
          </ul>
        </details>}
      </fieldset>
      {restore && <ReviewDialog title={t("Review workspace recovery")} disabled={busy || working}
        onCancel={() => setRestore(undefined)}
        onConfirm={async () => {
          const result = await run(restore.action, { document: { ...restore.document, dryRun: false } });
          if (result?.status === "RESTORED") setRestore(undefined);
        }}>
        <p>{t("Recover {calendars} calendars and {actual} confirmed assignments.", {
          calendars: Number(restore.preview?.archiveCount ?? 0), actual: Number(restore.preview?.historyAssignmentsAfter ?? 0),
        })}</p>
      </ReviewDialog>}
    </section>
  );
}
