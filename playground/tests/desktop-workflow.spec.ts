import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { example, openWorkspace, state } from "./workspace-fixture";

async function paste(page: Page, candidate: unknown) {
  await page.getByText("Paste a JSON answer", { exact: true }).click();
  await page.getByLabel(/Complete scenario.*JSON/).fill(JSON.stringify(candidate));
  await page.getByRole("button", { name: "Validate and preview configuration" }).click();
}

test("empty desktop workspace, isolated demo and reviewed AI creation with bilingual navigation", async ({ page, request }, info) => {
  await openWorkspace(request, info);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
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
  await page.getByRole("button", { name: "Open a local or shared workspace" }).click();
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
  await expect(page.getByText("Review the JSON and try again.")).toBeVisible();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("REFERENCE");
  await page.getByLabel("Complete scenario JSON").fill(JSON.stringify(candidate));
  await page.getByRole("button", { name: "Validate and preview configuration" }).click();
  const review = page.getByRole("dialog", { name: "Review configuration changes" });
  await expect(review).toContainText(candidate.label);
  expect((await state(request)).scenario).toBeNull();
  await review.getByRole("button", { name: "Confirm changes" }).click();
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
  await review.getByRole("button", { name: "Confirm changes" }).click();
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
