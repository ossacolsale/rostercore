import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { example, openWorkspace, state } from "./workspace-fixture";

async function paste(page: Page, candidate: unknown) {
  await page.getByText("Paste a JSON answer", { exact: true }).click();
  await page.getByLabel(/Complete scenario.*JSON/).fill(JSON.stringify(candidate));
  await page.getByRole("button", { name: "Validate and preview configuration" }).click();
}

test("empty desktop workspace, isolated demo and reviewed AI creation with bilingual navigation", async ({ page, request }, info) => {
  await openWorkspace(request, info);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How do you want to start?" })).toBeVisible();
  await page.getByRole("button", { name: "Change workspace" }).click();
  await expect(page.getByRole("heading", { name: "Where do you want to work?" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "Try an isolated demo" }).click();
  await expect(page.getByText("Isolated demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate schedule" }).click();
  await expect(page.locator(".roster tbody tr")).toHaveCount(5, { timeout: 30000 });
  expect((await state(request)).scenario).toBeNull();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await page.evaluate(() => {
    localStorage.setItem("rostercore.scenario.v1", "damaged scenario");
    localStorage.setItem("rostercore.archives.v1", "damaged archives");
  });
  await page.getByRole("button", { name: "Recover previous data" }).click();
  const recovery = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export browser recovery data" }).click();
  expect(JSON.parse(await readFile((await (await recovery).path())!, "utf8"))).toEqual({
    rawScenarioStorage: "damaged scenario", rawArchiveStorage: "damaged archives",
  });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Create a configuration with AI" }).click();
  await page.getByLabel("What do you need to plan?").fill("Plan a five-person business.");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download AI package" }).click();
  const resources = JSON.parse(await readFile((await (await download).path())!, "utf8"));
  expect(Object.keys(resources.schemas)).toEqual(["scenario"]);
  expect(Object.keys(resources.guides)).toHaveLength(1);
  expect(resources.context).toBeUndefined();

  const candidate = await example();
  const invalid = structuredClone(candidate);
  invalid.employees[0].typeId = "missing-role";
  await paste(page, invalid);
  await expect(page.getByText("The file could not be imported. Check the details before trying again.")).toBeVisible();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("REFERENCE");
  await page.getByLabel("Complete scenario JSON").fill(JSON.stringify(candidate));
  await page.getByRole("button", { name: "Validate and preview configuration" }).click();
  const review = page.getByRole("dialog", { name: "Review configuration changes" });
  await expect(review).toContainText(candidate.label);
  expect((await state(request)).scenario).toBeNull();
  await review.getByRole("button", { name: "Import and save" }).click();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(4);
  await page.getByLabel("Language / Lingua").selectOption("it");
  await expect(page.getByRole("navigation").getByRole("button", { name: "Persone" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Language / Lingua")).toHaveValue("it");
  expect((await state(request)).scenario).toEqual(candidate);
});

test("a typed update is reviewed and a person can be edited without AI", async ({ page, request }, info) => {
  const candidate = await example();
  await openWorkspace(request, info, candidate);
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Configuration" }).click();
  await page.getByLabel("What would you like to change?").fill("Giuseppe is on leave.");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download AI package" }).click();
  const resources = JSON.parse(await readFile((await (await download).path())!, "utf8"));
  expect(Object.keys(resources.schemas)).toEqual(["scenario-change-set"]);
  expect(resources.context.scenarioId).toBe(candidate.id);
  expect(resources.context.employees[0].label).toBeUndefined();
  expect(resources.scenario).toBeUndefined();

  const patch = JSON.parse(await readFile(new URL("../../AI_EXAMPLES/03-giuseppe-vacation.json", import.meta.url), "utf8"));
  await paste(page, patch);
  const review = page.getByRole("dialog", { name: "Review configuration changes" });
  await expect(review).toContainText("Unavailability for Giuseppe");
  expect((await state(request)).scenario.revision).toBe(candidate.revision);
  await review.getByRole("button", { name: "Import and save" }).click();
  await expect(review).not.toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "People" }).click();
  const row = page.getByRole("row").filter({ hasText: "Giuseppe" });
  await expect(row).toContainText("2027-08-10");
  await row.getByRole("button", { name: "Edit person" }).click();
  await page.getByLabel("Colleague name").fill("Pino");
  await page.getByRole("button", { name: "Preview planning change" }).click();
  await expect(page.getByRole("dialog")).toContainText("Rename Giuseppe to Pino.");
  await page.getByRole("button", { name: "Apply planning change" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Pino" })).toContainText("2027-08-10");
});

test("solver failures stay visible without reporting publication or a successful save", async ({ page, request }, info) => {
  const candidate = await (await request.get("/api/example")).json();
  candidate.availability = [{ id: "everyone-away", selector: {}, scope: {}, state: "ABSENT" }];
  await openWorkspace(request, info, candidate);
  await page.goto("/");
  await page.getByRole("button", { name: "Generate schedule" }).click();
  await expect(page.locator(".notification.warning, .notification.error").filter({ hasText: "INFEASIBLE" })).toBeVisible();
  await expect(page.locator(".notification.success").filter({ hasText: "INFEASIBLE" })).toHaveCount(0);
  expect((await state(request)).archives).toHaveLength(0);
});

test("backup import uses the chosen workspace and returns to a single calendar", async ({ page, request }, info) => {
  await openWorkspace(request, info, await example());
  const initial = await state(request);
  const run = async (current: typeof initial, action: string, document?: unknown) => {
    const { id, revision, session } = current;
    const response = await request.post("/api/workspace/run", { data: {
      action, document, expected: { id, revision, session },
    } });
    return response.json();
  };
  const { workspace: populated } = await run(initial, "solve");
  expect(populated.archives).toHaveLength(1);
  const { result: { document: backup } } = await run(populated, "archives", {
    operation: "BACKUP", dryRun: false, createdAt: new Date().toISOString(),
  });
  await page.goto("/");
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Workspace and backups", exact: true }).click();
  await page.getByRole("button", { name: "New workspace", exact: true }).click();
  const filename = info.outputPath("Restored team.sqlite");
  await mkdir(path.dirname(filename), { recursive: true });
  await page.getByLabel("Choose a different file location").fill(filename);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByText(filename, { exact: true })).toBeVisible();
  const importBackup = async () => {
    await page.getByRole("button", { name: "Import a file", exact: true }).click();
    await page.getByLabel("Choose a RosterCore file").setInputFiles({
      name: "earlier-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.getByRole("button", { name: "Review import", exact: true }).click();
    return page.getByRole("dialog", { name: "Review import", exact: true });
  };
  const review = await importBackup();
  await expect(review).toContainText("Calendars after import: 1");
  expect((await state(request)).scenario).toBeNull();
  await review.getByRole("button", { name: "Restore workspace", exact: true }).click();
  await expect(page.locator(".roster tbody tr")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Assignment calendar" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Workspace and backups" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await nav.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "Anna" }).getByRole("button", { name: "Edit person" }).click();
  await expect(page.getByLabel("Colleague name")).toHaveValue("Anna");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: "Anna" }).getByRole("button", { name: "Edit person" })).toBeFocused();
  await nav.getByRole("button", { name: "Configuration", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Current rules" })).toBeVisible();
  await nav.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Export calendar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");

  await nav.getByRole("button", { name: "Archive", exact: true }).click();
  const replacement = await importBackup();
  await expect(replacement).toContainText("This replaces the current workspace data.");
  await replacement.getByRole("button", { name: "Restore workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assignment calendar" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Workspace and backups" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Restored team.sqlite" })).toBeVisible();
  await page.getByRole("button", { name: "Restored team.sqlite" }).click();
  await page.getByRole("button", { name: "Try an isolated demo" }).click();
  await expect(page.getByText("Isolated demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await expect(page.locator(".roster tbody tr")).toHaveCount(5);
  expect((await state(request)).archives[0].integrityHash).toBe(populated.archives[0].integrityHash);
});
