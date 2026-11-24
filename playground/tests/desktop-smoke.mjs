import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";

const executablePath = path.resolve(process.argv[2]);
const folder = await mkdtemp(path.join(tmpdir(), "rostercore-desktop-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  key !== "ELECTRON_RUN_AS_NODE" && !key.startsWith("ROSTERCORE_")));
let instance;
try {
  instance = await electron.launch({
    executablePath,
    cwd: folder,
    args: process.env.ROSTERCORE_TEST_NO_SANDBOX ? ["--no-sandbox"] : [],
    env: { ...env, ROSTERCORE_DATA_DIR: folder, PORT: "0" },
    timeout: 25000,
  });
  const window = await instance.firstWindow();
  await window.getByRole("heading", { name: "Where do you want to work?" }).waitFor();
  assert.equal(await window.evaluate(() => typeof globalThis.rosterCore?.chooseFile), "function");
  assert.equal(await window.evaluate(() => typeof globalThis.require), "undefined");
  const candidate = JSON.parse(await readFile(new URL("../../AI_EXAMPLES/01-create-scenario.json", import.meta.url)));
  await window.getByRole("button", { name: "New workspace", exact: true }).click();
  await window.getByRole("button", { name: "Use suggested destination" }).click();
  await window.getByRole("button", { name: "Import a file", exact: true }).click();
  await window.locator('input[type="file"]').setInputFiles({
    name: "configuration.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(candidate)),
  });
  await window.getByRole("button", { name: "Review import" }).click();
  const review = window.getByRole("dialog", { name: "Review configuration changes" });
  await review.getByRole("button", { name: "Import and save" }).click();
  await window.getByRole("button", { name: "Generate schedule" }).click();
  await window.locator(".roster tbody tr").first().waitFor({ timeout: 35000 });
  const persisted = await window.request.get(new URL("/api/workspace", window.url()).href).then((r) => r.json());
  assert.equal(persisted.scenario.id, candidate.id);
  assert.ok(persisted.activeArchiveId);
  assert.match(await readFile(path.join(folder, "workspace.sqlite"), { encoding: "latin1" }), /^SQLite format 3/);
  console.log(`Desktop smoke passed: ${executablePath}`);
} finally {
  await instance?.close();
  await rm(folder, { recursive: true, force: true });
}
