import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, realpathSync, statfsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const applicationId = 0x524f5354; // ROST
const migrations = `
  PRAGMA application_id = ${applicationId};
  PRAGMA user_version = 1;
  CREATE TABLE workspace (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    scenario TEXT,
    archives TEXT NOT NULL,
    active_archive_id TEXT
  ) STRICT;
  CREATE TABLE scenario_revisions (
    workspace_revision INTEGER PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    scenario_revision INTEGER NOT NULL,
    saved_at TEXT NOT NULL,
    scenario TEXT NOT NULL
  ) STRICT;
`;

export class WorkspaceConflict extends Error {
  constructor() {
    super("Workspace changed. Reload it and review your changes again.");
  }
}

export const emptyWorkspace = (id = randomUUID()) => ({
  id, revision: 0, scenario: null, archives: [], activeArchiveId: null,
});

export function matches(workspace, expected) {
  return workspace.id === expected?.id && workspace.revision === expected.revision;
}

export const workspaceVersion = ({ id, revision }) => ({ id, revision });

function localFile(filename) {
  if (typeof filename !== "string" || !path.isAbsolute(filename))
    throw new Error("Choose an absolute local file path.");
  const folder = realpathSync(path.dirname(filename));
  filename = existsSync(filename) ? realpathSync(filename) : path.join(folder, path.basename(filename));
  if (process.platform === "win32") {
    const drive = path.parse(filename).root;
    if (!/^[a-z]:\\$/i.test(drive))
      throw new Error("Choose a local disk for SQLite. Connect through a host for shared work.");
    const check = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `exit [int]([System.IO.DriveInfo]::new('${drive}').DriveType)`], { windowsHide: true, timeout: 5000 });
    if (![2, 3, 6].includes(check.status))
      throw new Error("Choose a local disk for SQLite. Connect through a host for shared work.");
  } else {
    const filesystem = statfsSync(existsSync(filename) ? filename : folder).type >>> 0;
    if ([0x6969, 0x517b, 0xff534d42, 0xfe534d42, 0x73757245, 0x5346414f].includes(filesystem))
      throw new Error("Choose a local disk for SQLite. Connect through a host for shared work.");
  }
  return filename;
}

export class WorkspaceStore {
  constructor(filename, { create = false } = {}) {
    const memory = filename === ":memory:";
    this.filename = memory ? filename : localFile(filename);
    let created = false;
    if (!memory && create) {
      closeSync(openSync(this.filename, "wx", 0o600));
      created = true;
    }
    if (!memory && !existsSync(this.filename)) throw new Error("Workspace file does not exist.");
    try {
      this.db = new DatabaseSync(this.filename);
      this.db.exec("PRAGMA busy_timeout = 4000; PRAGMA trusted_schema = OFF");
      if (memory || created) {
        this.db.exec("BEGIN IMMEDIATE");
        this.db.exec(migrations);
        this.db.prepare("INSERT INTO workspace VALUES (1, ?, 0, NULL, '[]', NULL)").run(randomUUID());
        this.db.exec("COMMIT");
      }
      if (this.db.prepare("PRAGMA application_id").get().application_id !== applicationId ||
          this.db.prepare("PRAGMA user_version").get().user_version !== 1)
        throw new Error("Choose a RosterCore SQLite workspace.");
      this.read();
    } catch (error) {
      this.db?.close();
      if (created) unlinkSync(this.filename);
      throw error;
    }
  }

  read() {
    const row = this.db.prepare("SELECT * FROM workspace WHERE singleton = 1").get();
    if (!row) throw new Error("Workspace file is missing its data.");
    return {
      id: row.id, revision: row.revision,
      scenario: row.scenario === null ? null : JSON.parse(row.scenario),
      archives: JSON.parse(row.archives),
      activeArchiveId: row.active_archive_id,
    };
  }

  write(before, next) {
    const oldScenario = before.scenario === null ? null : JSON.stringify(before.scenario);
    const scenario = next.scenario === null ? null : JSON.stringify(next.scenario);
    const archives = JSON.stringify(next.archives);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const revision = before.revision + 1;
      const updated = this.db.prepare(`
        UPDATE workspace SET revision = ?, scenario = ?, archives = ?, active_archive_id = ?
        WHERE singleton = 1 AND id = ? AND revision = ?
      `).run(revision, scenario, archives, next.activeArchiveId, before.id, before.revision);
      if (!updated.changes) throw new WorkspaceConflict();
      if (scenario !== null && scenario !== oldScenario)
        this.db.prepare("INSERT INTO scenario_revisions VALUES (?, ?, ?, ?, ?)")
          .run(revision, next.scenario.id, next.scenario.revision, new Date().toISOString(), scenario);
      this.db.exec("COMMIT");
      return { ...next, revision };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  revisions() {
    return this.db.prepare(`
      SELECT workspace_revision AS revision, scenario_id AS scenarioId,
        scenario_revision AS scenarioRevision, saved_at AS savedAt
      FROM scenario_revisions ORDER BY workspace_revision DESC
    `).all();
  }

  revision(number) {
    const row = this.db.prepare("SELECT scenario FROM scenario_revisions WHERE workspace_revision = ?").get(number);
    if (!row) throw Object.assign(new Error("Configuration revision was not found."), { statusCode: 404 });
    return JSON.parse(row.scenario);
  }

  async backup(destination) {
    destination = localFile(destination);
    closeSync(openSync(destination, "wx", 0o600));
    try {
      await backup(this.db, destination);
    } catch (error) {
      unlinkSync(destination);
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}
