import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const document = (name) => readFile(new URL(`../../AI_EXAMPLES/${name}.json`, import.meta.url), "utf8").then(JSON.parse);
const version = ({ id, revision, session }) => ({ id, revision, session });
const payload = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function call(base, pathname, body) {
  const response = await fetch(base + pathname, body === undefined ? undefined : payload(body));
  return { status: response.status, data: await response.json() };
}
const command = (base, snapshot, action, extra = {}) =>
  call(base, "/api/workspace/run", { ...extra, action, expected: version(snapshot) });
const workspace = async (base) => (await call(base, "/api/workspace")).data;
async function start(t, env, { headless = false } = {}) {
  const child = spawn(process.execPath, ["server.mjs", headless ? "--headless" : "--production"], {
    env: { ...process.env, PORT: "0", ...env }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  return new Promise((resolve, reject) => {
    let output = "";
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const url = output.match(/https?:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) resolve({ url, child });
    });
    child.once("error", reject);
    child.once("exit", () => reject(new Error(output)));
  });
}

async function initialize(base, candidate) {
  const empty = await workspace(base);
  assert.equal(empty.scenario, null);
  const args = { document: { candidate, mode: "NEW_SCENARIO", expectedRevision: 0, allowHardRuleChanges: false } };
  const preview = await command(base, empty, "import-scenario", args);
  assert.equal(preview.data.result.status, "PREVIEW", JSON.stringify(preview.data));
  assert.equal((await workspace(base)).revision, empty.revision);
  const imported = await command(base, empty, "import-scenario", { ...args, apply: true });
  assert.equal(imported.data.result.status, "IMPORTED", JSON.stringify(imported.data));
  return imported.data.workspace;
}

test("AI import, native verification and a reviewed calendar revision preserve confirmed history", async (t) => {
  const { url } = await start(t, { ROSTERCORE_WORKSPACE: ":memory:" });
  const scenario = await document("01-create-scenario");
  const first = await initialize(url, scenario);
  const solved = await command(url, first, "solve");
  assert.ok(["OPTIMAL", "FEASIBLE"].includes(solved.data.result.status), JSON.stringify(solved.data.result.diagnostics));
  let saved = solved.data.workspace;
  const archiveId = saved.activeArchiveId;
  const verified = await command(url, saved, "verify", { archiveId });
  assert.equal(verified.data.result.status, "VERIFIED");
  async function archives(operation, snapshot, extra = {}, expected = "PREVIEW", dryRun = true) {
    const response = await command(url, snapshot, "archives", { document: {
      operation, id: archiveId, expectedRevision: snapshot.scenario.revision, dryRun, ...extra,
    } });
    assert.equal(response.data.result.status, expected, JSON.stringify(response.data.result.diagnostics));
    return response.data.workspace ?? response.data.result;
  }
  saved = await archives("PUBLISH", saved, {}, "PUBLISHED", false);
  assert.deepEqual(saved.scenario.history.assignments, []);
  saved = await archives("COMPLETE", saved, { through: "2026-11-09" }, "CONSOLIDATED", false);
  const baseline = saved.scenario.history;
  assert.ok(baseline.assignments.length);
  const from = "2026-11-10";
  const reviewed = await archives("REVISE", saved, { from });
  const change = await document("04-marco-unexpected-absence");
  change.expectedRevision = reviewed.preview.afterRevision;
  change.referenceDate = from;
  change.operations[0].value.scope.start = from;
  const changed = await command(url, saved, "change-set", {
    document: change, proposal: { archiveId, from }, apply: true,
    regeneration: { from, previousArchiveId: archiveId, stabilityPriority: "AFTER_FAIRNESS" },
  });
  assert.ok(["OPTIMAL", "FEASIBLE"].includes(changed.data.result.status), JSON.stringify(changed.data.result));
  const revision = changed.data.workspace;
  assert.equal(revision.revision, saved.revision + 1);
  assert.deepEqual(revision.scenario.history, baseline);
  assert.equal(revision.archives[0].completedThrough, "2026-11-09");
  assert.equal(revision.archives[0].state, "COMPLETED");
  assert.equal(revision.archives.at(-1).supersedesId, archiveId);
  assert.equal(revision.archives.at(-1).state, "DRAFT");
  assert.equal(revision.scenario.appliedChangeSets[0].id, change.id);
});

test("SQLite reopens, backs up and restores, and legacy JSON remains importable", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "rostercore-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settings = path.join(dir, "location.json");
  const { url, child } = await start(t, { ROSTERCORE_SETTINGS: settings });
  const file = path.join(dir, "chosen.sqlite");
  const backup = path.join(dir, "backup.sqlite");
  const recovered = path.join(dir, "recovered.sqlite");
  assert.equal((await call(url, "/api/workspace/location", { operation: "CREATE", path: file })).status, 200);
  const initial = await initialize(url, await document("01-create-scenario"));
  assert.equal((await call(url, "/api/workspace/backup-file", { path: backup })).status, 200);
  const jsonBackup = await command(url, initial, "archives", { document: {
    operation: "BACKUP", dryRun: false, createdAt: new Date().toISOString(),
  } });
  child.kill();
  await once(child, "exit");
  const reopened = await start(t, { ROSTERCORE_SETTINGS: settings });
  const restored = await workspace(reopened.url);
  assert.equal(restored.id, initial.id);
  assert.deepEqual(restored.scenario, initial.scenario);
  assert.notEqual(restored.session, initial.session);
  const copy = await call(reopened.url, "/api/workspace/location", { operation: "RESTORE", source: backup, path: recovered });
  assert.equal(copy.status, 200, JSON.stringify(copy.data));
  assert.equal(copy.data.location, recovered);
  assert.deepEqual(copy.data.workspace.scenario, initial.scenario);
  assert.equal((await command(reopened.url, restored, "solve")).status, 409, "a confirmed review from the first file cannot select the backup");
  const revisions = await call(reopened.url, "/api/workspace/revisions");
  assert.equal(revisions.data.length, 1);
  assert.deepEqual((await call(reopened.url, "/api/workspace/revisions/1")).data, initial.scenario);
  const empty = (await call(reopened.url, "/api/workspace/location", { operation: "CREATE", path: path.join(dir, "legacy.sqlite") })).data.workspace;
  const request = { operation: "RESTORE", expectedRevision: initial.scenario.revision, backup: jsonBackup.data.result.document };
  assert.equal((await command(reopened.url, empty, "archives", { document: { ...request, dryRun: true } })).data.result.status, "PREVIEW");
  const legacy = await command(reopened.url, empty, "archives", { document: { ...request, dryRun: false } });
  assert.equal(legacy.data.result.status, "RESTORED");
  assert.deepEqual(legacy.data.workspace.scenario, initial.scenario);
});

test("two LAN clients use TLS and a stale reviewed modification cannot overwrite a newer save", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "rostercore-lan-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cert = path.join(dir, "cert.pem");
  const key = path.join(dir, "key.pem");
  const token = "test-shared-secret-26";
  const generated = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", cert]);
  assert.equal(generated.status, 0, generated.error?.message ?? generated.stderr?.toString());
  const host = await start(t, {
    ROSTERCORE_LISTEN: "127.0.0.1", ROSTERCORE_TLS_PORT: "0", ROSTERCORE_TOKEN: token,
    ROSTERCORE_TLS_KEY: key, ROSTERCORE_TLS_CERT: cert, ROSTERCORE_WORKSPACE: path.join(dir, "authoritative.sqlite"),
  }, { headless: true });
  const one = await start(t, { ROSTERCORE_WORKSPACE: ":memory:" });
  const two = await start(t, { ROSTERCORE_WORKSPACE: ":memory:" });
  const connection = { operation: "CONNECT", url: host.url, certificate: await readFile(cert, "utf8"), token };
  assert.equal((await call(one.url, "/api/workspace/location", { ...connection, certificate: "" })).status, 503);
  assert.equal((await call(one.url, "/api/workspace/location", { ...connection, token: "wrong-access-token" })).status, 401);
  for (const client of [one, two]) {
    const response = await call(client.url, "/api/workspace/location", connection);
    assert.equal(response.data.mode, "CLIENT", JSON.stringify(response.data));
  }
  const a = await initialize(one.url, await document("01-create-scenario"));
  const b = await workspace(two.url);
  assert.equal(a.id, b.id);
  assert.equal(a.revision, b.revision);
  const first = await document("02-anna-part-time");
  const second = await document("03-giuseppe-vacation");
  for (const [client, snapshot, document] of [[one, a, first], [two, b, second]]) {
    const check = await command(client.url, snapshot, "change-set", { document, apply: false });
    assert.equal(check.data.result.status, "PREVIEW", JSON.stringify(check.data));
  }
  const outcomes = await Promise.all([
    command(one.url, a, "change-set", { document: first, apply: true }),
    command(two.url, b, "change-set", { document: second, apply: true }),
  ]);
  assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 409]);
  const winner = outcomes.findIndex(({ status }) => status === 200);
  const latest = await workspace(two.url);
  assert.equal(latest.revision, b.revision + 1);
  assert.deepEqual(latest.scenario.appliedChangeSets.map(({ id }) => id), [[first, second][winner].id]);
  assert.deepEqual(latest.scenario.history, a.scenario.history);
});
