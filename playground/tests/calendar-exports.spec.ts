import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
const workspace = (page: Page) => page.locator(".simple-workspace");
const archive = async (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("rostercore.archives.v1")!).at(-1),
  );
async function generate(page: Page) {
  await workspace(page)
    .getByRole("button", { name: "Generate schedule", exact: true })
    .click();
  await expect(workspace(page).locator(".roster tbody tr")).toHaveCount(5, {
    timeout: 35000,
  });
}
async function download(page: Page, name: string) {
  const wait = page.waitForEvent("download");
  await page
    .getByRole("dialog", { name: "Export calendar", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  const file = await wait;
  return readFile((await file.path())!);
}
test("ordinary user sees a quiet calendar and exports a matching paginated PDF, CSV and full archive", async ({
  page,
}, info) => {
  await page.goto("/");
  await generate(page);
  const before = await archive(page);
  await expect(workspace(page).locator(".operational-status")).toHaveText(
    "Calendar generated",
  );
  await expect(workspace(page).locator(".stats,.fairness-chart")).toHaveCount(
    0,
  );
  await expect(
    workspace(page).getByText("Search evidence", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".notification.success:visible")).toHaveCount(0);
  await expect(page.getByText("Interface mode", { exact: true })).toHaveCount(
    0,
  );
  await workspace(page)
    .getByRole("button", { name: "Hide normal work", exact: true })
    .click();
  await expect(
    workspace(page).locator(".calendar-state-filtered_shift"),
  ).not.toHaveCount(0);
  await workspace(page)
    .getByRole("button", { name: "Export calendar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Export calendar",
    exact: true,
  });
  await expect(
    dialog.getByRole("img", { name: "PDF page 1", exact: true }),
  ).toBeVisible();
  const count = await dialog.locator(".pdf-preview-section strong").innerText();
  const bytes = await download(page, "Download PDF");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(Number(count.match(/(\d+) pages/)![1]));
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  await dialog.getByLabel("File format", { exact: true }).selectOption("CSV");
  await expect(
    dialog.getByRole("button", { name: "Download CSV", exact: true }),
  ).toBeEnabled();
  const csv = (await download(page, "Download CSV")).toString("utf8");
  expect(csv.startsWith("\uFEFF")).toBeTruthy();
  expect(csv).toContain("FILTERED_SHIFT");
  await dialog.getByLabel("File format", { exact: true }).selectOption("JSON");
  const canonical = JSON.parse(
    (await download(page, "Save complete calendar archive")).toString(),
  );
  expect(canonical).toEqual(before);
  expect(
    canonical.result.assignments.some(
      (a: any) =>
        a.shiftId ===
        before.scenario.shifts.find(
          (sh: any) => sh.kind === "WORKING" && !sh.fairnessTags?.length,
        ).id,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByLabel("File format", { exact: true }).selectOption("PDF");
  await expect(
    dialog.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("export-phone.png") });
  await dialog
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  await expect(
    workspace(page).getByRole("button", {
      name: "Export calendar",
      exact: true,
    }),
  ).toBeFocused();
  expect(await archive(page)).toEqual(before);
});
test("personal calendars contain only selected people; Italian controls and errors preserve original data", async ({
  page,
}) => {
  await page.goto("/");
  await generate(page);
  const before = await archive(page);
  await workspace(page)
    .getByRole("button", { name: "Export calendar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Export calendar",
    exact: true,
  });
  await dialog.getByLabel("File format", { exact: true }).selectOption("ICS");
  await dialog
    .getByLabel("Calendar files", { exact: true })
    .selectOption("INDIVIDUAL");
  await expect(
    dialog.getByRole("button", {
      name: "Download personal calendars ZIP",
      exact: true,
    }),
  ).toBeEnabled();
  const zip = unzipSync(
    await download(page, "Download personal calendars ZIP"),
  );
  expect(Object.keys(zip)).toHaveLength(5);
  const first = before.scenario.employees[0],
    second = before.scenario.employees[1];
  const file = Object.values(zip).find((b) =>
    strFromU8(b).includes("X-WR-CALNAME:" + first.label),
  )!;
  expect(strFromU8(file)).not.toContain(second.label);
  await dialog
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  await page
    .getByLabel("Language / Lingua", { exact: true })
    .selectOption("it");
  await workspace(page)
    .getByRole("button", { name: "Esporta calendario", exact: true })
    .click();
  const italian = page.getByRole("dialog", {
    name: "Esporta calendario",
    exact: true,
  });
  await italian
    .getByLabel("Inizio esportazione", { exact: true })
    .fill("1900-01-01");
  await expect(italian.getByRole("alert")).toContainText(
    "periodo del calendario salvato",
  );
  await expect(
    italian.getByRole("button", { name: "Scarica PDF", exact: true }),
  ).toBeDisabled();
  expect(await archive(page)).toEqual(before);
});
test("HR user reviews absence as a future proposal, regenerates differences and explicitly publishes the replacement", async ({
  page,
}) => {
  await page.goto("/");
  await generate(page);
  await workspace(page)
    .getByRole("button", { name: "Publish calendar", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm calendar operation" })
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await expect(workspace(page).locator(".operational-status")).toHaveText(
    "Published",
  );
  const original = await archive(page);
  await workspace(page)
    .getByRole("button", { name: "Modify planning", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Modify planning",
    exact: true,
  });
  await form.getByLabel("Effective from", { exact: true }).fill("2026-11-10");
  await form
    .getByLabel("Through, inclusive", { exact: true })
    .fill("2026-11-10");
  await form
    .getByRole("button", { name: "Preview planning change", exact: true })
    .click();
  await expect(
    form.getByRole("button", {
      name: "Preview as a revision proposal",
      exact: true,
    }),
  ).toBeVisible();
  await form
    .getByRole("button", {
      name: "Preview as a revision proposal",
      exact: true,
    })
    .click();
  await expect(form.locator(".change-summary")).toContainText(
    "Unavailability for",
  );
  expect((await archive(page)).state).toBe("PUBLISHED");
  await form
    .getByRole("button", { name: "Apply planning change", exact: true })
    .click();
  await expect(form).not.toBeVisible({ timeout: 45000 });
  await expect(workspace(page).locator(".calendar-differences")).toBeVisible();
  const revised = await archive(page);
  expect(revised.supersedesId).toBe(original.id);
  expect(
    revised.result.calendarStates.some(
      (c: any) =>
        c.employeeId === original.scenario.employees[0].id &&
        c.date === "2026-11-10" &&
        c.state === "ABSENT",
    ),
  ).toBeTruthy();
  expect(revised.scenario.history).toEqual(original.scenario.history);
  const old = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("rostercore.archives.v1")!).find(
        (a: any) => a.id === id,
      ),
    original.id,
  );
  expect(old.state).toBe("PUBLISHED");
  await workspace(page)
    .getByRole("button", { name: "Publish calendar", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm calendar operation" })
    .getByRole("button", { name: "Confirm changes" })
    .click();
  await expect(workspace(page).locator(".operational-status")).toHaveText(
    "Published",
  );
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem("rostercore.archives.v1")!).find(
          (a: any) => a.id === id,
        ).state,
      original.id,
    ),
  ).toBe("SUPERSEDED");
});
test("expert finds complete native diagnostics without changing scenario or publishing", async ({
  page,
}) => {
  await page.goto("/");
  await generate(page);
  const before = await archive(page);
  await workspace(page)
    .getByText("More calendar actions", { exact: true })
    .click();
  await workspace(page)
    .getByRole("button", { name: "Diagnostics and verification", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Diagnostics and verification",
    exact: true,
  });
  await expect(dialog.locator("pre")).toContainText("configurationHash");
  await expect(dialog.locator("pre")).toContainText("phases");
  await dialog
    .getByRole("button", {
      name: "Diagnostics and verification - close",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Interface mode", { exact: true })
    .selectOption("ADVANCED");
  await expect(
    page.getByRole("heading", { name: "Continuous fairness", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Search evidence", exact: true }),
  ).toBeVisible();
  expect(await archive(page)).toEqual(before);
});

test("recording actual work rejects future dates and requires explicit final confirmation", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-10T12:00:00Z") });
  await page.goto("/");
  await generate(page);
  await workspace(page)
    .getByText("More calendar actions", { exact: true })
    .click();
  await workspace(page)
    .getByRole("button", { name: "Record work performed", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Record work performed",
    exact: true,
  });
  await form
    .getByLabel("Actually worked through", { exact: true })
    .fill("2026-11-22");
  await form
    .getByLabel("I confirm these shifts were actually worked", { exact: true })
    .check();
  await expect(
    form.getByRole("button", { name: "Review completed work", exact: true }),
  ).toBeDisabled();
  await form
    .getByLabel("Actually worked through", { exact: true })
    .fill("2026-11-09");
  await form
    .getByLabel("I confirm these shifts were actually worked", { exact: true })
    .check();
  await form
    .getByRole("button", { name: "Review completed work", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Confirm calendar operation",
    exact: true,
  });
  await expect(
    review.getByRole("button", { name: "Confirm changes", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("rostercore.scenario.v1")!).history
          .assignments.length,
    ),
  ).toBe(0);
  await review
    .getByLabel("I confirm these shifts were actually worked", { exact: true })
    .check();
  await review
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("rostercore.scenario.v1")!).history
              .through,
        ),
    )
    .toBe("2026-11-09");
  const saved = await archive(page);
  expect(saved.completedThrough).toBe("2026-11-09");
  expect(saved.state).toBe("COMPLETED");
  expect(saved.publishedLocks).toHaveLength(0);
});

test("PDF non-working dates and named print-profile variants survive reopening and reload", async ({
  page,
}) => {
  await page.goto("/");
  await generate(page);
  const original = await archive(page);
  await workspace(page)
    .getByRole("button", { name: "Export calendar", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Export calendar",
    exact: true,
  });
  await dialog
    .getByLabel("Exclude all days with no work", { exact: true })
    .check();
  await expect(
    dialog.getByText("Printing 5 of 7 dates", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  // Chromium versions differ in the punctuation emitted by Intl date formatting.
  await expect(
    dialog.locator(".pdf-preview text").filter({ hasText: /Sat,?\s+14\/11/ }),
  ).toHaveCount(0);
  await expect(
    dialog.locator(".pdf-preview text").filter({ hasText: /Mon,?\s+09\/11/ }),
  ).toHaveCount(1);
  await dialog
    .getByLabel("Print profile name", { exact: true })
    .fill("Workdays");
  await dialog
    .getByRole("button", { name: "Save as new print profile", exact: true })
    .click();
  await dialog
    .getByLabel("Rest days, including weekly rest", { exact: true })
    .uncheck();
  await dialog.getByLabel("Paper size", { exact: true }).selectOption("A3");
  await dialog
    .getByLabel("Print profile name", { exact: true })
    .fill("Full week A3");
  await dialog
    .getByRole("button", { name: "Save as new print profile", exact: true })
    .click();
  let profiles = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("rostercore.print-profiles.v1")!)
        .profiles,
  );
  expect(profiles).toHaveLength(2);
  expect(profiles[0].presentation.paper).toBe("A4");
  expect(profiles[0].presentation.excludedDayCategories).toContain("REST");
  expect(profiles[1].presentation.excludedDayCategories).not.toContain("REST");
  await dialog
    .getByLabel("Saved print profile", { exact: true })
    .selectOption({ label: "Workdays" });
  await expect(dialog.getByLabel("Paper size", { exact: true })).toHaveValue(
    "A4",
  );
  await expect(
    dialog.getByText("Printing 5 of 7 dates", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Saved print profile", { exact: true })
    .selectOption({ label: "Full week A3" });
  await expect(
    dialog.getByText("Printing 7 of 7 dates", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Rest days, including weekly rest", { exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Update selected print profile", exact: true })
    .click();
  expect(await archive(page)).toEqual(original);
  await dialog
    .getByRole("button", { name: "Close export", exact: true })
    .click();
  await page.reload();
  await workspace(page)
    .getByText("Saved calendars and recovery", { exact: true })
    .click();
  await workspace(page)
    .locator(".archive-list")
    .getByRole("button", { name: "Export calendar", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Export calendar", exact: true });
  await dialog
    .getByLabel("Saved print profile", { exact: true })
    .selectOption({ label: "Full week A3" });
  await expect(dialog.getByLabel("Paper size", { exact: true })).toHaveValue(
    "A3",
  );
  await expect(
    dialog.getByLabel("Rest days, including weekly rest", { exact: true }),
  ).toBeChecked();
  profiles = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("rostercore.print-profiles.v1")!)
        .profiles,
  );
  expect(profiles).toHaveLength(2);
  expect(profiles[0].presentation.paper).toBe("A4");
  expect(
    profiles.every((p: any) => p.options.includeAbsenceReasons === false),
  ).toBeTruthy();
  expect(await archive(page)).toEqual(original);
});

test("Italian PDF exclusions reject an empty printout and leave canonical JSON untouched", async ({
  page,
}) => {
  await page.goto("/");
  await generate(page);
  const original = await archive(page);
  await page
    .getByLabel("Language / Lingua", { exact: true })
    .selectOption("it");
  await workspace(page)
    .getByRole("button", { name: "Esporta calendario", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Esporta calendario",
    exact: true,
  });
  await dialog
    .getByLabel("Inizio esportazione", { exact: true })
    .fill("2026-11-14");
  await dialog
    .getByLabel("Fine esportazione", { exact: true })
    .fill("2026-11-15");
  await dialog
    .getByLabel("Escludi tutti i giorni senza lavoro", { exact: true })
    .check();
  await expect(dialog.getByRole("alert")).toContainText(
    "Non rimangono giorni da stampare",
  );
  await expect(
    dialog.getByRole("button", { name: "Scarica PDF", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator(".pdf-preview")).toHaveCount(0);
  await dialog
    .getByLabel("Formato del file", { exact: true })
    .selectOption("JSON");
  const wait = page.waitForEvent("download");
  await dialog
    .getByRole("button", {
      name: "Salva l'archivio completo del calendario",
      exact: true,
    })
    .click();
  const file = await wait;
  expect(JSON.parse(await readFile((await file.path())!, "utf8"))).toEqual(
    original,
  );
});
