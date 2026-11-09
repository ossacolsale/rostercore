import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem("rostercore.mode.v1","ADVANCED"));});

async function configureRule(
  page: Page,
  index: number,
  pattern: string,
  contract: string,
) {
  await page
    .getByRole("button", { name: "Add automatic assignment rule", exact: true })
    .click();
  const card = page
    .locator("article.item-card")
    .filter({ has: page.getByLabel("Assignment rule label", { exact: true }) })
    .nth(index);
  await card
    .getByLabel("Assignment rule label", { exact: true })
    .fill(contract + " association");
  await card
    .getByLabel("Assigned work pattern", { exact: true })
    .selectOption({ label: pattern });
  await card.locator(".selector > summary").click();
  await card
    .getByRole("button", { name: "Add attribute condition", exact: true })
    .click();
  await card
    .getByLabel("Attribute condition", { exact: true })
    .selectOption("EQ");
  await card
    .getByLabel("Contract type", { exact: true })
    .selectOption({ label: contract });
}
const employeeCard = (page: Page, index: number) =>
  page
    .locator("article.item-card")
    .filter({
      has: page.getByLabel("Pattern assignment mode", { exact: true }),
    })
    .nth(index);

test("configure attributes, logical shifts, patterns, rules, employees and variants without JSON", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an empty scenario", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add employee type", exact: true })
    .click();
  await page.getByLabel("Type label", { exact: true }).fill("Team");
  await page
    .getByRole("button", { name: "Create attribute definition", exact: true })
    .click();
  await page
    .getByLabel("Attribute label", { exact: true })
    .fill("Contract type");
  await page.getByLabel("Value type", { exact: true }).selectOption("ENUM");
  await page.getByLabel("Provide a default value", { exact: true }).check();
  await page.getByTestId("nav-shifts").click();
  for (const name of ["Work", "Rest"]) {
    await page
      .getByRole("button", { name: "Add shift type", exact: true })
      .click();
    await page.getByLabel("Shift label", { exact: true }).last().fill(name);
  }
  await page
    .getByLabel("Structural type", { exact: true })
    .last()
    .selectOption("OFF");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  for (const name of ["FULL_TIME", "PART_TIME_MORNING"]) {
    await page
      .getByRole("button", { name: "Create work pattern", exact: true })
      .click();
    await page
      .getByLabel("Work pattern label", { exact: true })
      .last()
      .fill(name);
  }
  await configureRule(page, 0, "FULL_TIME", "FULL_TIME");
  await configureRule(page, 1, "PART_TIME_MORNING", "PART_TIME");
  await page.getByTestId("nav-people").click();
  for (const name of ["Worker A", "Worker B"]) {
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    await page.getByLabel("Name / label", { exact: true }).last().fill(name);
  }
  const part = employeeCard(page, 1);
  await part
    .getByText("Typed attributes and defaults", { exact: true })
    .click();
  await part
    .getByLabel("Contract type", { exact: true })
    .selectOption("EXPLICIT");
  await part
    .getByLabel("Contract type", { exact: true })
    .last()
    .selectOption({ label: "PART_TIME" });
  await page.getByTestId("nav-contracts").click();
  await page
    .getByRole("button", { name: "Preview pattern assignments", exact: true })
    .click();
  const table = page.getByTestId("pattern-preview");
  await expect(
    table.locator("tbody tr").filter({ hasText: "Worker A" }),
  ).toContainText("FULL_TIME");
  await expect(
    table.locator("tbody tr").filter({ hasText: "Worker B" }),
  ).toContainText("PART_TIME_MORNING");
  await expect(table).toContainText("AUTOMATIC_RULE");
  await page.getByTestId("nav-people").click();
  await employeeCard(page, 1)
    .getByLabel("Pattern assignment mode", { exact: true })
    .selectOption("MANUAL");
  await expect(employeeCard(page, 1)).toContainText("INDIVIDUAL");
  await employeeCard(page, 1)
    .getByLabel("Pattern assignment mode", { exact: true })
    .selectOption("AUTO");
  await expect(employeeCard(page, 1)).toContainText("PART_TIME_MORNING");
  await page.getByTestId("nav-variants").click();
  for (const [name, pattern] of [
    ["Full hours", "FULL_TIME"],
    ["Morning hours", "PART_TIME_MORNING"],
  ]) {
    await page
      .getByRole("button", { name: "Add concrete variant", exact: true })
      .click();
    await page.getByLabel("Variant label", { exact: true }).last().fill(name);
    const variant = page
      .locator("article.item-card")
      .filter({ has: page.locator('input[value="' + name + '"]') })
      .last();
    await variant
      .getByRole("group", {
        name: "Work patterns (empty means all)",
        exact: true,
      })
      .getByRole("checkbox", { name: new RegExp("^" + pattern) })
      .check();
    if (name === "Morning hours")
      await variant.getByLabel("End", { exact: true }).fill("12:00");
  }
  const morning = page
    .locator("article.item-card")
    .filter({ has: page.locator('input[value="Morning hours"]') })
    .last();
  await morning
    .getByText("Preview variant applicability", { exact: true })
    .click();
  await morning
    .getByRole("button", {
      name: "Preview applicable employees and dates",
      exact: true,
    })
    .click();
  await expect(morning).toContainText("Applicable employee-days: 1");
  await expect(morning).toContainText("Worker B");
  await expect(morning).toContainText("09:00–12:00");
  const saved = JSON.parse(
    (await page.evaluate(() =>
      localStorage.getItem("rostercore.scenario.v1"),
    )) || "{}",
  );
  expect(saved.schemaVersion).toBe(3);
  expect(
    saved.employees.every((e: { workPatternId?: string }) => !e.workPatternId),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Validate scenario", exact: true })
    .click();
  await expect(
    page.locator(".notification").filter({ hasText: "VALID" }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(page.locator(".status")).toHaveText("OPTIMAL");
  await page.getByLabel("Language / Lingua").selectOption("it");
  await page.getByTestId("nav-contracts").click();
  await page
    .getByRole("button", {
      name: "Anteprima delle associazioni agli schemi",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("pattern-preview")).toContainText(
    "Regola automatica",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("automatic-patterns-italian-mobile.png"),
    fullPage: true,
  });
});

test("catalogue deletion reports dependencies and legacy individual assignments survive reload", async ({
  page,
  request,
}) => {
  const scenario = await (await request.get("/api/example-evolution")).json();
  await page.addInitScript(
    (s) => localStorage.setItem("rostercore.scenario.v1", JSON.stringify(s)),
    scenario,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
  const stored = JSON.parse(
    (await page.evaluate(() =>
      localStorage.getItem("rostercore.scenario.v1"),
    )) || "{}",
  );
  expect(stored.schemaVersion).toBe(2);
  expect(stored.employees[0].workPatternId).toBe("full");
  await page.getByTestId("nav-contracts").click();
  const full = page.locator("article.item-card").filter({
    has: page.getByRole("heading", {
      name: "Full-time arrangement",
      exact: true,
    }),
  });
  await full.getByRole("button", { name: "Remove", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Review catalogue deletion",
  });
  await expect(dialog).toContainText("This item is still used.");
  await expect(
    dialog.getByRole("button", { name: "Confirm changes", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByLabel("Work pattern label", { exact: true }).first(),
  ).toHaveValue("Full-time arrangement");
  await page
    .getByRole("button", { name: "Add automatic assignment rule", exact: true })
    .click();
  await expect(
    page.getByLabel("Assignment rule label", { exact: true }),
  ).toHaveCount(0);
  expect(
    JSON.parse(
      (await page.evaluate(() =>
        localStorage.getItem("rostercore.scenario.v1"),
      )) || "{}",
    ).schemaVersion,
  ).toBe(2);
  await page
    .getByRole("button", { name: "Upgrade scenario format", exact: true })
    .click();
  await expect(
    page.locator(".notification").filter({ hasText: "MIGRATED" }),
  ).toBeVisible();
  const migrated = JSON.parse(
    (await page.evaluate(() =>
      localStorage.getItem("rostercore.scenario.v1"),
    )) || "{}",
  );
  expect(migrated.schemaVersion).toBe(4);
  expect(migrated.employees[0].workPatternId).toBe("full");
});

test("a reviewed future bulk change changes the resolved pattern and conflicting rules remain explicit", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Load automatic work-pattern example",
      exact: true,
    })
    .click();
  await page.getByTestId("nav-people").click();
  const bulk = page
    .getByRole("heading", { name: "Bulk and future changes", exact: true })
    .locator("..");
  await bulk.getByRole("checkbox", { name: /^Pharmacist A/ }).check();
  await bulk
    .getByLabel("Registered attribute", { exact: true })
    .selectOption({ label: "Contract type" });
  await bulk
    .getByLabel("Contract type", { exact: true })
    .selectOption({ label: "PART_TIME" });
  await bulk
    .getByLabel("Future effective date", { exact: true })
    .fill("2027-06-01");
  await bulk
    .getByRole("button", { name: "Schedule future change", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review workforce changes" });
  await expect(review).toContainText("Affected employees: 1");
  await expect(review).toContainText("Pharmacist A");
  await expect(review).toContainText("2027-06-01");
  await review
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await page.getByTestId("nav-contracts").click();
  await page
    .getByLabel("Assignment preview date", { exact: true })
    .fill("2027-05-31");
  await page
    .getByRole("button", { name: "Preview pattern assignments", exact: true })
    .click();
  const person = page
    .getByTestId("pattern-preview")
    .locator("tbody tr")
    .filter({ hasText: "Pharmacist A" });
  await expect(person).toContainText("Full-time arrangement");
  await page
    .getByLabel("Assignment preview date", { exact: true })
    .fill("2027-06-01");
  await page
    .getByRole("button", { name: "Preview pattern assignments", exact: true })
    .click();
  await expect(person).toContainText("Morning arrangement with full Friday");
  await page.screenshot({
    path: testInfo.outputPath("assignment-origins-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add automatic assignment rule", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview pattern assignments", exact: true })
    .click();
  await expect(person).toContainText("CONFLICT");
  await expect(page.locator(".notification.error")).toContainText("INSPECTED");
  await page
    .locator(".notification.error")
    .getByRole("button", { name: "View diagnostics", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Operation diagnostics" }),
  ).toContainText("WORK_PATTERN_ASSIGNMENT_CONFLICT");
});
