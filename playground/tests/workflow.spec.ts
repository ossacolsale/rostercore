import { test, expect } from "@playwright/test";
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem("rostercore.mode.v1","ADVANCED"));});
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
});
test("reference scenario generates verified real assignments and fairness", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible({ timeout: 35000 });
  await expect(page.locator(".status")).toHaveText("OPTIMAL");
  await expect(page.locator(".roster tbody tr")).toHaveCount(5);
  await expect(
    page.getByRole("img", { name: "Fairness debt trajectory" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verify independently" }).click();
  await expect(
    page.locator(".notification").filter({ hasText: "VERIFIED" }).last(),
  ).toBeVisible();
});
test("visual people, shifts and recursive rules are editable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "02 People & groups" }).click();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await expect(page.getByLabel("Name / label").last()).toHaveValue(
    "New employee",
  );
  await page.getByLabel("Name / label").last().fill("Finley");
  await page.getByRole("button", { name: "03 Shift types" }).click();
  await page.getByRole("button", { name: "Add time interval" }).first().click();
  await expect(page.getByText("Interval 3")).toBeVisible();
  await page.getByRole("button", { name: "09 Planning policies" }).click();
  await page
    .getByRole("button", { name: "+ OR group", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByLabel("Expression operator")
      .filter({ has: page.locator('option:checked[value="OR"]') }),
  ).toHaveCount(1);
});
test("policy preview requires confirmation and applies one policy", async ({
  page,
}) => {
  await page.getByRole("button", { name: "10 AI & HR imports" }).click();
  const text = await readFile(
    new URL("../../examples/policy-create.json", import.meta.url),
    "utf8",
  );
  await page.getByLabel("Policy or HR document JSON").fill(text);
  await expect(
    page.getByRole("button", { name: "Confirm and apply import" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Preview & validate import" }).click();
  await expect(page.getByText("Changes awaiting confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and apply import" }).click();
  await expect(
    page.locator(".notification").filter({ hasText: "IMPORTED" }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "09 Planning policies" }).click();
  await expect(
    page.getByRole("heading", { name: "Regular duty fairness" }),
  ).toBeVisible();
});
test("HR import reaches core and shows absence in a generated schedule", async ({
  page,
}) => {
  await page.getByRole("button", { name: "10 AI & HR imports" }).click();
  await page.getByLabel("Document kind").selectOption("sync-hr");
  const text = await readFile(
    new URL("../../examples/hr-events.json", import.meta.url),
    "utf8",
  );
  await page.getByLabel("Policy or HR document JSON").fill(text);
  await page.getByRole("button", { name: "Preview & validate import" }).click();
  await expect(page.getByText("Changes awaiting confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and apply import" }).click();
  await expect(
    page.locator(".notification").filter({ hasText: "IMPORTED" }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible({ timeout: 35000 });
  await expect(
    page
      .locator(".roster tbody tr")
      .first()
      .getByRole("button", {name:/Unavailable/}),
  ).toHaveCount(2);
});
test("foreign origins and arbitrary engine commands are rejected", async ({
  request,
}) => {
  const res = await request.post("/api/run", {
    headers: { Origin: "https://untrusted.example" },
    data: { action: "solve" },
  });
  expect(res.status()).toBe(403);
  const bad = await request.post("/api/run", {
    data: { action: "arbitrary-shell-command" },
  });
  expect(bad.status()).toBe(400);
});

test("an empty scenario can be configured and solved without JSON", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Create an empty scenario" }).click();
  await page
    .getByRole("button", { name: "Add employee type", exact: true })
    .click();
  await page.getByLabel("Type label").fill("Team");
  for (const name of ["One", "Two", "Three"]) {
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    await page.getByLabel("Name / label").last().fill(name);
  }
  await page.getByRole("button", { name: "03 Shift types" }).click();
  await page
    .getByRole("button", { name: "Add shift type", exact: true })
    .click();
  await page.getByLabel("Shift label").last().fill("Duty");
  await page
    .getByRole("button", { name: "Add shift type", exact: true })
    .click();
  await page.getByLabel("Shift label").last().fill("Rest");
  await page.getByLabel("Structural type").last().selectOption("OFF");
  await page.getByRole("button", { name: "09 Planning policies" }).click();
  await page.getByRole("button", { name: "Add policy" }).click();
  await page
    .getByRole("button", { name: "Add policy rule", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible({ timeout: 35000 });
  await expect(page.locator(".status")).toHaveText("OPTIMAL");
  await expect(page.locator(".roster tbody tr")).toHaveCount(3);
});
