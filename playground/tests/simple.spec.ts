import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const current = (page: Page) => page.locator(".simple-workspace");
const step = async (page: Page, n: number) => {
  await page.getByTestId("simple-step-" + n).click();
};
const stored = async (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("rostercore.scenario.v1")!),
  );
test("simple mode is the default, bilingual and usable at desktop, tablet, phone and 200 percent layout scale", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByLabel("Interface mode", { exact: true })).toHaveValue(
    "SIMPLE",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Setup questions" })
      .getByRole("button"),
  ).toHaveCount(6);
  await page.screenshot({ path: info.outputPath("simple-desktop.png") });
  const contrasts = await page
    .locator(".simple-steps button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const style = getComputedStyle(button);
        const luminance = (color: string) => {
          const rgb = (color.match(/[0-9.]+/g) ?? ["255", "255", "255"])
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045
                ? c / 12.92
                : Math.pow((c + 0.055) / 1.055, 2.4);
            });
          return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        };
        const fg = luminance(style.color),
          bg = luminance(style.backgroundColor);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      }),
    );
  expect(contrasts.every((value) => value >= 4.5)).toBeTruthy();
  const before = await stored(page);
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390)
      await page.screenshot({ path: info.outputPath("simple-phone.png") });
    for (let i = 0; i < 6; i++) {
      await step(page, i);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      ).toBeTruthy();
      const overlaps = await page
        .locator(".simple-workspace label.field:visible")
        .evaluateAll(
          (labels) =>
            labels.filter((l) => {
              const title = l.querySelector(":scope > span");
              const control = l.querySelector("input,select,textarea");
              if (!title || !control) return false;
              return (
                title.getBoundingClientRect().bottom >
                control.getBoundingClientRect().top + 1
              );
            }).length,
        );
      expect(overlaps).toBe(0);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await step(page, 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("simple-200-percent.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.body.style.zoom = "1";
  });
  await page
    .getByLabel("Language / Lingua", { exact: true })
    .selectOption("it");
  await expect(page.getByTestId("simple-step-0")).toContainText("Chi lavora");
  expect((await stored(page)).id).toBe(before.id);
  await page.reload();
  await expect(
    page.getByLabel("Modalità interfaccia", { exact: true }),
  ).toHaveValue("SIMPLE");
});
test("configure a ten-person pharmacy-like team, responsibility coverage and combined fairness without JSON or priorities", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await current(page)
    .getByRole("button", { name: "Start a new scenario", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await current(page)
    .getByLabel("Scenario name", { exact: true })
    .fill("Visual ten-person team");
  for (let i = 0; i < 2; i++)
    await current(page)
      .getByRole("button", { name: "Add role", exact: true })
      .click();
  await current(page).getByText("Edit role names", { exact: true }).click();
  for (const [i, name] of ["Pharmacists", "Warehouse", "Reserves"].entries())
    await current(page)
      .getByLabel("Role name", { exact: true })
      .nth(i)
      .fill(name);
  for (let i = 0; i < 10; i++) {
    await current(page)
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const card = current(page).locator(".simple-grid > article").last();
    await card
      .getByLabel("Employee name", { exact: true })
      .fill("Colleague " + (i + 1));
    await card.getByLabel("Role", { exact: true }).selectOption({
      label: i < 5 ? "Pharmacists" : i < 7 ? "Warehouse" : "Reserves",
    });
    await card
      .getByLabel("Employment starts", { exact: true })
      .fill("2026-01-01");
  }
  await current(page)
    .locator(".simple-grid > article")
    .first()
    .getByLabel("Contract", { exact: true })
    .selectOption("PART_TIME");
  await current(page)
    .getByText("Contracts and qualifications", { exact: true })
    .click();
  await current(page)
    .getByLabel("Qualification name", { exact: true })
    .fill("Can close");
  await current(page)
    .getByRole("button", { name: "Add qualification", exact: true })
    .click();
  for (let i = 0; i < 7; i++)
    await current(page)
      .locator(".simple-grid > article")
      .nth(i)
      .getByLabel("Can close", { exact: true })
      .check();
  await step(page, 1);
  await current(page)
    .getByLabel("Planning starts", { exact: true })
    .fill("2026-11-09");
  await current(page)
    .getByLabel("Planning ends", { exact: true })
    .fill("2026-11-22");
  await step(page, 2);
  for (const name of ["Evening closing", "Both closings"]) {
    await current(page)
      .getByRole("button", { name: "Add working shift", exact: true })
      .click();
    await current(page)
      .getByLabel("Shift name", { exact: true })
      .last()
      .fill(name);
  }
  await current(page)
    .getByRole("button", { name: "Add work pattern", exact: true })
    .click();
  await current(page)
    .getByLabel("Work-pattern name", { exact: true })
    .last()
    .fill("Full-time pattern");
  await current(page)
    .getByRole("button", { name: "Add work pattern", exact: true })
    .click();
  await current(page)
    .getByLabel("Work-pattern name", { exact: true })
    .last()
    .fill("Part-time pattern");
  const part = current(page)
    .locator("article.item-card")
    .filter({ has: page.getByLabel("Work-pattern name", { exact: true }) })
    .last();
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday"]) {
    const allowed = part.getByRole("group", {
      name: day + ": Permitted shifts",
      exact: true,
    });
    await allowed.getByLabel("Evening closing", { exact: true }).uncheck();
    await allowed.getByLabel("Both closings", { exact: true }).uncheck();
  }
  await current(page)
    .getByRole("button", { name: "Add automatic work-pattern rule" })
    .click();
  await current(page)
    .getByRole("button", { name: "Add automatic work-pattern rule" })
    .click();
  const rules = current(page)
    .locator(".item-card")
    .filter({
      has: page.getByLabel("Assign this work pattern", { exact: true }),
    });
  await rules
    .last()
    .getByLabel("Who does this apply to?", { exact: true })
    .selectOption({ label: "Contract: PART_TIME" });
  await rules
    .last()
    .getByLabel("Assign this work pattern", { exact: true })
    .selectOption({ label: "Part-time pattern" });
  await current(page)
    .getByRole("button", { name: "Preview resolved work patterns" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await step(page, 3);
  await current(page)
    .getByLabel("Required duty", { exact: true })
    .selectOption({ label: "Evening closing" });
  await current(page)
    .getByLabel("Prefer these people", { exact: true })
    .selectOption({ label: "Choose several roles" });
  await current(page)
    .getByLabel("Required qualification", { exact: true })
    .first()
    .selectOption({ label: "Can close" });
  const primary = current(page).getByRole("group", { name: "Included roles" });
  await primary.getByLabel("Pharmacists", { exact: true }).check();
  await primary.getByLabel("Warehouse", { exact: true }).check();
  await current(page)
    .getByLabel("Use substitutes only when needed", { exact: true })
    .check();
  await current(page)
    .getByLabel("Substitute resources", { exact: true })
    .selectOption({ label: "Role: Reserves" });
  await current(page)
    .getByRole("button", { name: "Add coverage requirement", exact: true })
    .click();
  await current(page)
    .getByLabel("Required duty", { exact: true })
    .selectOption({ label: "Both closings" });
  await current(page)
    .getByLabel("Prefer these people", { exact: true })
    .selectOption({ label: "Role: Pharmacists" });
  await current(page)
    .getByRole("button", { name: "Add coverage requirement", exact: true })
    .click();
  await current(page)
    .getByText("What should everyone else work?", { exact: true })
    .click();
  await current(page)
    .getByRole("button", { name: "Apply normal-work rule" })
    .click();
  await step(page, 4);
  const duties = current(page).getByRole("group", {
    name: "Treat these duties as one burden category",
  });
  await duties.getByLabel("Evening closing", { exact: true }).check();
  await duties.getByLabel("Both closings", { exact: true }).check();
  await current(page)
    .getByLabel("Who does this apply to?", { exact: true })
    .selectOption({ label: "Choose several roles" });
  const roles = current(page).getByRole("group", { name: "Included roles" });
  await roles.getByLabel("Pharmacists", { exact: true }).check();
  await roles.getByLabel("Warehouse", { exact: true }).check();
  await current(page)
    .getByRole("button", { name: "Share the combined burden fairly" })
    .click();
  await current(page)
    .getByLabel("Reuse an existing burden category", { exact: true })
    .selectOption({ label: "Combined burden" });
  await current(page).getByRole("button", { name: "Add spacing rule" }).click();
  await step(page, 5);
  await current(page)
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await expect(
    current(page).getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible({ timeout: 45000 });
  await expect(current(page).locator(".archive-list article")).toHaveCount(1, {
    timeout: 45000,
  });
  const data = await page.evaluate(
    () => JSON.parse(localStorage.getItem("rostercore.archives.v1")!)[0],
  );
  expect(data.result.quality.fallback.totalSubstitutions).toBe(0);
  expect(
    data.result.assignments.filter((a: any) =>
      ["Evening closing", "Both closings"].includes(
        data.scenario.shifts.find((s: any) => s.id === a.shiftId)?.label,
      ),
    ),
  ).toHaveLength(20);
  expect(data.scenario.spacingRules[0].fairnessTags).toEqual(
    data.scenario.policies[0].objective.fairnessTags,
  );
  const verified = await page.request.post("/api/run", {
    data: { action: "verify", scenario: data.scenario, result: data.result },
  });
  expect((await verified.json()).status).toBe("VERIFIED");
  await page
    .getByLabel("Interface mode", { exact: true })
    .selectOption("ADVANCED");
  expect((await stored(page)).id).toBe(data.scenario.id);
  await page
    .getByLabel("Interface mode", { exact: true })
    .selectOption("SIMPLE");
  await expect(
    current(page).getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible();
});
test("saved calendars survive reload and full backup restore without duplicate historical debt", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await current(page)
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await expect(current(page).locator(".archive-list article")).toHaveCount(1, {
    timeout: 35000,
  });
  await page.reload();
  await current(page)
    .getByText("Saved calendars and recovery", { exact: true })
    .click();
  await current(page)
    .getByRole("button", { name: "Open calendar", exact: true })
    .click();
  await expect(
    current(page).getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible();
  const card = current(page).locator(".archive-list article").first();
  await card
    .getByText("Publication, completed work and revisions", { exact: true })
    .click();
  await card.getByRole("button", { name: "Publish this calendar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await expect(card.locator(".badge").first()).toHaveText("PUBLISHED");
  await card
    .getByLabel("Actually worked through", { exact: true })
    .fill("2026-11-09");
  await card.getByLabel("I confirm these shifts were actually worked").check();
  await card.getByRole("button", { name: "Confirm completed work" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await expect(card.locator(".badge").first()).toHaveText("COMPLETED");
  const before = await stored(page);
  const event = page.waitForEvent("download");
  await current(page)
    .getByRole("button", { name: "Export complete workspace backup" })
    .click();
  const file = await event;
  const bytes = await readFile((await file.path())!);
  const parsed = JSON.parse(bytes.toString());
  expect(parsed.scenario.history.assignments.length).toBeGreaterThan(0);
  expect(parsed.archives).toHaveLength(1);
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4318" });
  const fresh = await ctx.newPage();
  await fresh.goto("/");
  await current(fresh)
    .getByText("Saved calendars and recovery", { exact: true })
    .click();
  await current(fresh)
    .getByLabel("Import a calendar or backup", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: bytes,
    });
  await current(fresh)
    .getByRole("button", { name: "Validate and preview import" })
    .click();
  await fresh
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await expect
    .poll(async () => (await stored(fresh)).history.assignments.length)
    .toBe(before.history.assignments.length);
  await expect(current(fresh).locator(".archive-list article")).toHaveCount(1);
  await current(fresh)
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await expect(current(fresh).locator(".archive-list article")).toHaveCount(2, {
    timeout: 35000,
  });
  await ctx.close();
});
test("AI package minimizes personal data and typed updates require explicit preview confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await current(page)
    .getByRole("button", { name: "Ask AI for help", exact: true })
    .click();
  const event = page.waitForEvent("download");
  await current(page)
    .getByRole("button", { name: "Prepare configuration for AI" })
    .click();
  const file = await event;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.personalDataIncluded).toBe(false);
  expect(data.scenario).toBeUndefined();
  expect(data.context.employees[0].label).toBeUndefined();
  expect(data.context.scenarioRevision).toBe(1);
  expect(data.schemas["scenario-change-set"]).toBeTruthy();
  expect(data.guides["AI_SCENARIO_UPDATE_GUIDE.md"]).toContain(
    "UPDATE_EMPLOYEE",
  );
  const change = await readFile(
    new URL("../../AI_EXAMPLES/02-anna-part-time.json", import.meta.url),
    "utf8",
  );
  await current(page).getByText("Paste a JSON answer", { exact: true }).click();
  await current(page)
    .getByLabel("Complete scenario or scenario change-set JSON", {
      exact: true,
    })
    .fill(change);
  await current(page)
    .getByRole("button", { name: "Validate and preview configuration" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review configuration changes" }),
  ).toBeVisible();
  expect((await stored(page)).revision).toBe(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await expect.poll(async () => (await stored(page)).revision).toBe(2);
  expect(
    (await stored(page)).employees[0].versions[0].attributes.contract,
  ).toBe("PART_TIME");
});
