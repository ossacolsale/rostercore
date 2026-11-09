import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("rostercore.mode.v1", "ADVANCED"),
  );
});
import { readFile } from "node:fs/promises";

const selector = "Language / Lingua";

test("language switches immediately, persists and preserves the scenario", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
  const initial = await page.evaluate(() =>
    localStorage.getItem("rostercore.scenario.v1"),
  );
  await page.getByLabel(selector).selectOption("it");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page).toHaveTitle("RosterCore · Laboratorio di pianificazione");
  await expect(
    page.getByRole("heading", { name: "Il tuo scenario di pianificazione" }),
  ).toBeVisible();
  for (const [nav, heading] of [
    ["02 Personale e gruppi", "Personale e gruppi"],
    ["03 Tipologie di turno", "Tipologie di turno"],
    ["07 Calendario e disponibilità", "Calendario e disponibilità"],
    ["09 Politiche di pianificazione", "Politiche di pianificazione"],
    ["10 Importazioni AI e HR", "Importazioni AI e HR"],
  ]) {
    await page.getByRole("button", { name: nav }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel(selector)).toHaveValue("it");
  await expect(
    page.getByRole("heading", { name: "Il tuo scenario di pianificazione" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("rostercore.scenario.v1")),
  ).toBe(initial);
  await page.getByLabel(selector).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("rostercore.scenario.v1")),
  ).toBe(initial);
});

test("Italian results keep the same assignments without another solve", async ({
  page,
}) => {
  let solves = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/run") &&
      request.postDataJSON()?.action === "solve"
    )
      solves++;
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your planning scenario" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate schedule" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Assignment calendar" }),
  ).toBeVisible();
  const shifts = await page.locator(".shift-cell").allTextContents();
  await page.getByLabel(selector).selectOption("it");
  await expect(page.locator(".status")).toHaveText("Soluzione ottimale");
  await expect(
    page.getByRole("heading", { name: "Calendario delle assegnazioni" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Andamento del debito di equità" }),
  ).toBeVisible();
  await expect(
    page.getByText("Massimo debito nei prefissi", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".roster thead")).toContainText("lun");
  expect(await page.locator(".shift-cell").allTextContents()).toEqual(shifts);
  expect(solves).toBe(1);
  await page
    .getByRole("button", { name: "Verifica indipendente", exact: true })
    .click();
  await expect(
    page.locator(".notification").filter({ hasText: "Verificato" }).last(),
  ).toBeVisible();
  await page.getByLabel(selector).selectOption("en");
  await expect(page.locator(".status")).toHaveText("OPTIMAL");
});

test("Italian errors preserve diagnostic codes and original technical details", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel(selector).selectOption("it");
  await page.getByRole("button", { name: "10 Importazioni AI e HR" }).click();
  await page
    .getByLabel("Documento JSON di politica o eventi HR")
    .fill("{invalid");
  await expect(
    page.getByText("JSON non valido. Controlla la sintassi del documento.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText("Dettagli tecnici originali", { exact: true }).click();
  await expect(page.locator(".error pre")).not.toBeEmpty();
  const invalid = await readFile(
    new URL("../../examples/policy-invalid.json", import.meta.url),
    "utf8",
  );
  await page.getByLabel("Documento JSON di politica o eventi HR").fill(invalid);
  await page
    .getByRole("button", { name: "Anteprima e validazione dell'importazione" })
    .click();
  await expect(page.locator(".notification.error").last()).toContainText(
    "Errore di validazione",
  );
  await page
    .locator(".notification.error")
    .getByRole("button", { name: "Visualizza diagnostiche" })
    .click();
  await expect(page.locator(".diagnostic b")).toHaveText("SCHEMA");
  await expect(page.getByRole("dialog")).toContainText(
    "Il documento non rispetta lo schema JSON.",
  );
  await page
    .getByRole("dialog")
    .getByText("Messaggio originale", { exact: true })
    .click();
  await expect(page.locator(".diagnostic pre")).not.toBeEmpty();
  await page
    .getByRole("button", { name: "Chiudi diagnostiche", exact: true })
    .click();
  await page
    .locator(".notification.error")
    .getByRole("button", { name: "Chiudi notifica", exact: true })
    .click();
  const scenario = await (await request.get("/api/example")).json();
  scenario.employees[0].typeId = "missing-type";
  await page.getByRole("button", { name: "{ } JSON avanzato" }).click();
  await page.getByLabel("JSON dello scenario").fill(JSON.stringify(scenario));
  await page.getByRole("button", { name: "Valida e applica il JSON" }).click();
  await page
    .locator(".notification.error")
    .getByRole("button", { name: "Visualizza diagnostiche" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Riferimento inesistente: missing-type",
  );
  await expect(page.locator(".diagnostic b")).toHaveText("REFERENCE");
  await page
    .getByRole("button", { name: "Chiudi diagnostiche", exact: true })
    .click();
  await page.getByLabel(selector).selectOption("en");
  await page
    .locator(".notification.error")
    .getByRole("button", { name: "View diagnostics" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Unknown reference: missing-type",
  );
});

test("mobile language selector remains accessible and Italian defaults can be edited", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel(selector).selectOption("it");
  await expect(
    page.getByRole("heading", { name: "Il tuo scenario di pianificazione" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("italian-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Crea uno scenario vuoto" }).click();
  await page
    .getByRole("button", {
      name: "Aggiungi tipologia di dipendente",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Etichetta della tipologia")).toHaveValue(
    "Nuova tipologia",
  );
  await page
    .getByRole("button", { name: "Aggiungi dipendente", exact: true })
    .click();
  await page.getByLabel("Nome / etichetta").fill("Nome personalizzato");
  await page.getByLabel(selector).selectOption("en");
  await expect(page.getByLabel("Name / label")).toHaveValue(
    "Nome personalizzato",
  );
});

test("Italian catalogue covers UI keys and preserves interpolation parameters", async () => {
  const ts = await import("typescript");
  const catalogue = JSON.parse(
    await readFile(new URL("../src/locales/it.json", import.meta.url), "utf8"),
  ) as Record<string, string>;
  for (const name of [
    "App",
    "simple",
    "archives",
    "quality",
    "ai-configuration",
    "editors",
    "setup",
    "policies",
    "imports",
    "results",
    "evolution",
    "planning-editors",
    "operational-results",
    "notifications",
    "configuration-guide",
    "pattern-assignments",
    "calendar-workspace",
    "calendar-changes",
    "calendar-view",
    "export-dialog",
    "work-completion",
  ]) {
    const text = await readFile(
      new URL(`../src/${name}.tsx`, import.meta.url),
      "utf8",
    );
    const source = ts.createSourceFile(
      name,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: import("typescript").Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        expect(
          Object.hasOwn(catalogue, key),
          `Missing Italian UI key: ${key}`,
        ).toBe(true);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const parameters = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [english, italian] of Object.entries(catalogue))
    expect(parameters(italian), english).toEqual(parameters(english));
});
