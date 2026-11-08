import { test, expect } from "@playwright/test";
test("operation feedback stays at the viewport bottom, translates, and exposes persistent error diagnostics", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  const success = page
    .locator(".notification.success")
    .filter({ has: page.locator("p b") });
  await expect(success).toContainText("OPTIMAL");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const box = await success.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  expect(box!.y).toBeGreaterThan(400);
  await page.getByLabel("Language / Lingua").selectOption("it");
  await expect(success).toContainText("Soluzione ottimale");
  await page.getByLabel("Language / Lingua").selectOption("en");
  const s = await (await request.get("/api/example")).json();
  s.employees[0].typeId = "missing-type";
  await page.getByTestId("nav-advanced").click();
  await page.getByLabel("Scenario JSON").fill(JSON.stringify(s));
  await page
    .getByRole("button", { name: "Validate & apply JSON", exact: true })
    .click();
  const error = page.locator(".notification.error");
  await expect(error).toContainText("VALIDATION_ERROR");
  await page.waitForTimeout(5500);
  await expect(error).toBeVisible();
  await expect(success).toHaveCount(0);
  await error
    .getByRole("button", { name: "View diagnostics", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Operation diagnostics" }),
  ).toContainText("REFERENCE");
  await page
    .getByRole("button", { name: "Close diagnostics", exact: true })
    .click();
  await error
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  await expect(error).toHaveCount(0);
});
test("logical shifts, work patterns and variants have a freely navigable guided order", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("nav-shifts").click();
  await expect(
    page.getByRole("button", { name: "03 Shift types", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add concrete variant", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Contracts & work patterns",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Logical shifts, variants and fairness categories",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Contracts & work patterns",
      exact: true,
    }),
  ).toBeVisible();
});

test("HTTP completion does not turn UNKNOWN or INFEASIBLE into success", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Global solve time budget (seconds)", { exact: true })
    .fill("0");
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(
    page.locator(".notification.warning").filter({ hasText: "UNKNOWN" }),
  ).toBeVisible();
  await expect(
    page.locator(".notification.success").filter({ hasText: "UNKNOWN" }),
  ).toHaveCount(0);
  const s = await (await request.get("/api/example")).json();
  s.availability = [
    { id: "everyone-away", selector: {}, scope: {}, state: "ABSENT" },
  ];
  await page.getByTestId("nav-advanced").click();
  await page.getByLabel("Scenario JSON").fill(JSON.stringify(s));
  await page
    .getByRole("button", { name: "Validate & apply JSON", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(
    page
      .locator(".notification.warning, .notification.error")
      .filter({ hasText: "INFEASIBLE" }),
  ).toBeVisible();
  await expect(
    page.locator(".notification.success").filter({ hasText: "INFEASIBLE" }),
  ).toHaveCount(0);
});

test("browser persistence failures appear as persistent global errors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "rostercore.scenario.v1")
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  const error = page.locator(".notification.error");
  await expect(error).toContainText("Browser storage is full or disabled.");
  await page.getByTestId("nav-people").click();
  await expect(error).toBeVisible();
  await error
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  await expect(error).toHaveCount(0);
});
