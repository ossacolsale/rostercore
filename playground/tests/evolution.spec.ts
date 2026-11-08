import { test, expect } from "@playwright/test";

test("dated pharmacy workflow previews hours, imports leave and regenerates with an explicit substitute", async ({
  page,
}, testInfo) => {
  page.on("pageerror", (error) => {
    console.error("BROWSER ERROR", error.message);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Load evolving pharmacy example",
      exact: true,
    })
    .click();
  await page.getByLabel("Planning start", { exact: true }).fill("2027-05-10");
  await page.getByLabel("Planning end", { exact: true }).fill("2027-05-14");
  await page.getByTestId("nav-people").click();
  await page
    .getByRole("button", { name: "Preview workforce and hours", exact: true })
    .click();
  const person = page
    .locator("tbody tr")
    .filter({ has: page.locator("th").filter({ hasText: /^Pharmacist C$/ }) });
  await expect(person).toContainText("08:30–13:00");
  await expect(person).not.toContainText("Evening closing");
  await page.getByLabel("Preview date", { exact: true }).fill("2027-05-14");
  await page
    .getByRole("button", { name: "Preview workforce and hours", exact: true })
    .click();
  await expect(person).toContainText("Evening closing");
  await page.getByTestId("nav-weeks").click();
  await page
    .getByRole("button", { name: "Preview weekly classification", exact: true })
    .click();
  await expect(page.locator(".week-preview")).toContainText("Regular week");
  await page.getByTestId("nav-coverage").click();
  await expect(page.getByLabel("Responsibility label").first()).toHaveValue(
    "Two Closings",
  );
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(page.locator(".status")).toHaveText("OPTIMAL", {
    timeout: 35000,
  });
  await expect(page.locator(".badge.fallback")).toHaveCount(0);
  await page.getByTestId("nav-imports").click();
  await page
    .getByLabel("Document kind", { exact: true })
    .selectOption("sync-hr");
  await page.getByLabel("Policy or HR document JSON").fill(
    JSON.stringify({
      format: "rostercore.hr-events",
      schemaVersion: 2,
      events: [
        {
          eventId: "sudden-leave-v1",
          source: "browser-test",
          externalId: "sudden-leave",
          employeeId: "p1",
          revision: 1,
          operation: "UPSERT",
          absenceType: "LEAVE",
          status: "APPROVED",
          start: "2027-05-10",
          end: "2027-05-10",
        },
      ],
    }),
  );
  await page
    .getByRole("button", { name: "Preview & validate import", exact: true })
    .click();
  await expect(
    page.getByText("Changes awaiting confirmation", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm and apply import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("IMPORTED");
  await page.getByLabel("Regenerate from", { exact: true }).fill("2027-05-10");
  await page
    .getByRole("button", { name: "Regenerate from this date", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Regeneration changes", exact: true }),
  ).toBeVisible({ timeout: 35000 });
  await expect(page.locator(".badge.fallback")).toHaveCount(1);
  await expect(page.locator(".stats > div").last()).toContainText("2");
  await expect(
    page
      .getByRole("heading", {
        name: "Operational coverage and substitutions",
        exact: true,
      })
      .locator(".."),
  ).toContainText("Reserve A");
  await page
    .getByRole("button", { name: "Verify independently", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("VERIFIED");
  await page.screenshot({
    path: testInfo.outputPath("evolution-desktop.png"),
    fullPage: true,
  });
  await page.getByLabel("Language / Lingua").selectOption("it");
  await expect(
    page.getByRole("heading", {
      name: "Modifiche della rigenerazione",
      exact: true,
    }),
  ).toBeVisible();
});

test("new catalogues, logical variants, recurrence and undo are editable without JSON", async ({
  page,
}, testInfo) => {
  page.on("pageerror", (error) => {
    console.error("BROWSER ERROR", error.message);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create an empty scenario", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add employee type", exact: true })
    .click();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await page
    .getByRole("button", { name: "Create attribute definition", exact: true })
    .click();
  await page
    .getByLabel("Attribute label", { exact: true })
    .fill("Night qualification");
  await page.getByLabel("Value type", { exact: true }).selectOption("BOOLEAN");
  await page.getByLabel("Provide a default value", { exact: true }).check();
  await page.getByTestId("nav-shifts").click();
  await page
    .getByRole("button", { name: "Add shift type", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add concrete variant", exact: true })
    .click();
  await page.getByLabel("Variant label", { exact: true }).fill("Morning hours");
  await page.getByTestId("nav-contracts").click();
  await page
    .getByRole("button", { name: "Create work pattern", exact: true })
    .click();
  await page
    .getByLabel("Work pattern label", { exact: true })
    .fill("Morning arrangement");
  await page.getByTestId("nav-weeks").click();
  await page
    .getByRole("button", { name: "Create week profile", exact: true })
    .click();
  await page.getByLabel("Profile label", { exact: true }).fill("Ordinary");
  await page
    .getByRole("button", { name: "Create week profile", exact: true })
    .click();
  await page
    .getByLabel("Profile label", { exact: true })
    .last()
    .fill("Special");
  await page
    .getByRole("button", { name: "Create recurrence version", exact: true })
    .click();
  await expect(
    page.getByLabel("Anchor date (normalized to ISO Monday)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo change", exact: true }).click();
  await expect(
    page.getByLabel("Anchor date (normalized to ISO Monday)", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview weekly classification", exact: true })
    .click();
  await expect(page.locator(".week-preview")).toContainText("Ordinary");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Language / Lingua").selectOption("it");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("evolution-mobile.png"),
    fullPage: true,
  });
});
