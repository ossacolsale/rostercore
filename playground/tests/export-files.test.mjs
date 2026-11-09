import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { unzipSync, strFromU8 } from "fflate";
const require = createRequire(import.meta.url),
  root = resolve(".."),
  out = resolve(root, "tmp/pdfs"),
  compiled = resolve("node_modules/.cache/rostercore/calendar-files.cjs");
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["src/calendar-files.ts"],
  outfile: compiled,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
});
const {
  generatePdf,
  generateIcs,
  calendarZip,
  individualCalendars,
  foldIcs,
} = require(compiled);
const python = process.env.EXPORT_PYTHON || process.env.PYTHON || "python3";
const native = process.env.ROSTERCORE_CLI || resolve(root, "build/rostercore");
const fixture = spawnSync(
  python,
  [resolve(root, "tests/export_fixtures.py"), native, out],
  { encoding: "utf8" },
);
assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
const load = async (name) =>
  JSON.parse(await readFile(resolve(out, name + ".json"), "utf8"));
const view = await load("standard"),
  fonts = {
    regular: new Uint8Array(await readFile("public/fonts/DejaVuSans.ttf")),
    bold: new Uint8Array(await readFile("public/fonts/DejaVuSans-Bold.ttf")),
  };
const t = (key, args = {}) =>
  key.replace(/\{(\w+)\}/g, (token, k) => String(args[k] ?? token));
const options = {
  language: "en",
  mode: "COMPACT",
  layout: "WEEK",
  paper: "A4",
  orientation: "AUTO",
  business: "Test business",
  title: "Verified calendar",
  notes: "Contact the planning office for changes.",
  showPublishedDate: true,
  showRevision: true,
  icsMode: "COLLECTIVE",
  includeTimesInDescription: true,
};
const stamp = new Date("2026-11-09T13:00:00Z");
const pdfs = [];
test("real PDFs: all layouts, paper sizes, actual hours and preview page count", async () => {
  const variants = [
    ["a4-week", { mode: "COMPACT" }],
    ["a4-complete", { mode: "COMPLETE" }],
    [
      "a4-month",
      { mode: "COMPLETE", layout: "MONTH", orientation: "PORTRAIT" },
    ],
    ["a3-week", { paper: "A3", mode: "COMPLETE" }],
    ["a3-month", { paper: "A3", layout: "MONTH", mode: "COMPACT" }],
    [
      "personal",
      { layout: "PERSON", mode: "COMPLETE", orientation: "PORTRAIT" },
    ],
    ["completed", { layout: "PERSON", mode: "COMPLETE" }],
  ];
  for (const [name, changes] of variants) {
    const v =
      name === "completed" ? await load("completed") : structuredClone(view);
    if (name === "a4-week") {
      v.employees = v.employees.slice(0, 1);
      v.cells = v.cells.filter((c) => c.employeeId === v.employees[0].id);
    }
    const result = await generatePdf(
      v,
      { ...options, ...changes },
      t,
      fonts,
      stamp,
    );
    assert.ok(result.bytes.length > 1000);
    assert.ok(result.pages.length > 0);
    assert.equal(
      new TextDecoder().decode(result.bytes.slice(0, 8)),
      "%PDF-1.7",
    );
    await writeFile(resolve(out, name + ".pdf"), result.bytes);
    pdfs.push({
      name,
      pages: result.pages.length,
      paper: changes.paper ?? "A4",
      width: result.pages[0].width,
      height: result.pages[0].height,
    });
    if (changes.mode === "COMPLETE")
      assert.ok(
        result.pages.some((p) =>
          p.texts.some((x) => x.text.includes("10:00-13:00")),
        ),
      );
  }
  const stress = structuredClone(view);
  stress.days = Array.from({ length: 31 }, (_, i) => ({
    date: `2027-05-${String(i + 1).padStart(2, "0")}`,
    profileId: "normal",
    profileLabel: "Normal week",
    holidays:
      i === 0
        ? [{ id: "holiday", label: "A long holiday label ".repeat(10) }]
        : [],
  }));
  stress.period.end = "2027-05-31";
  stress.employees = Array.from({ length: 75 }, (_, i) => ({
    id: "person-" + i,
    label:
      `Person ${i} - Very long international name Èléonore Κατερίνα Алексей `.repeat(
        2,
      ),
  }));
  stress.totalEmployees = 75;
  stress.cells = stress.employees.flatMap((e) =>
    stress.days.map((day) => ({
      ...structuredClone(view.cells[0]),
      employeeId: e.id,
      date: day.date,
    })),
  );
  const result = await generatePdf(
    stress,
    { ...options, layout: "MONTH", mode: "COMPLETE", orientation: "PORTRAIT" },
    t,
    fonts,
    stamp,
  );
  assert.ok(result.pages.length > 10);
  for (const page of result.pages) {
    for (const r of page.rects)
      assert.ok(r.y + r.height < page.height - 40, "rows stay above footer");
    assert.ok(
      page.texts.some((x) => x.text.includes("Employee")) ||
        page.texts.some(
          (x) => x.text.includes("Legend") || x.text.includes("Holidays"),
        ),
      "repeated headings",
    );
  }
  await writeFile(resolve(out, "stress.pdf"), result.bytes);
  pdfs.push({
    name: "stress",
    pages: result.pages.length,
    width: result.pages[0].width,
    height: result.pages[0].height,
  });
  await writeFile(resolve(out, "manifest.json"), JSON.stringify({ pdfs }));
  const bad = structuredClone(view);
  bad.scenarioLabel = "Unsupported 🚀";
  await assert.rejects(
    generatePdf(bad, { ...options, business: "", title: "" }, t, fonts, stamp),
    /cannot display/,
  );
});
test("ICS: true resolved instants, split intervals, folds, escaped UTF-8 and individual privacy", async () => {
  const ics = generateIcs(view, options, t, undefined, stamp);
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!ics.replaceAll("\r\n", "").includes("\n"));
  for (const line of ics.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(ics.includes("RELATED-TO;RELTYPE=SIBLING:"));
  assert.ok(!ics.includes("Private leave"));
  await writeFile(resolve(out, "collective.ics"), ics);
  for (const name of [
    "dst",
    "fold",
    "overnight",
    "completed",
    "absence",
    "private-absence",
  ])
    await writeFile(
      resolve(out, name + ".ics"),
      generateIcs(await load(name), options, t, undefined, stamp),
    );
  assert.throws(
    () => generateIcs(awaitUnknown, options, t),
    /supported time zone/,
  );
  const personal = generateIcs(view, options, t, "e1", stamp);
  assert.ok(!personal.includes("Marco Other-person"));
  assert.ok(!personal.includes("Rest Person"));
  await writeFile(resolve(out, "personal.ics"), personal);
  const filtered = generateIcs(
    await load("filtered"),
    options,
    t,
    undefined,
    stamp,
  );
  assert.ok(!filtered.includes("Regular"));
  await writeFile(resolve(out, "filtered.ics"), filtered);
  const zip = calendarZip(view, options, t, stamp),
    files = unzipSync(zip);
  assert.equal(Object.keys(files).length, 3);
  const expected = individualCalendars(view, options, t, stamp);
  assert.deepEqual(Object.keys(files), Object.keys(expected));
  for (const name of Object.keys(files))
    assert.deepEqual(files[name], expected[name]);
  for (const [name, bytes] of Object.entries(files)) {
    const text = strFromU8(bytes);
    if (name.startsWith("Anna"))
      assert.ok(!text.includes("Marco Other-person"));
  }
  await writeFile(resolve(out, "personal.zip"), zip);
  const names = structuredClone(view);
  names.employees = names.employees.map((e) => ({
    ...e,
    label: e.id === "e1" ? "../Same" : "SAME",
  }));
  const unique = Object.keys(individualCalendars(names, options, t, stamp));
  assert.equal(new Set(unique.map((s) => s.toLowerCase())).size, 3);
  assert.ok(unique.every((s) => !s.includes("/") && !s.includes("..")));
  const folded = foldIcs("DESCRIPTION:" + "è;quoted,テスト".repeat(30));
  for (const line of folded.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(
    folded.replace(/\r\n /g, ""),
    "DESCRIPTION:" + "è;quoted,テスト".repeat(30),
  );
});
const awaitUnknown = await load("unknown");
test("independent parsers verify saved PDF pages and iCalendar event semantics", async () => {
  const checked = spawnSync(
    python,
    [resolve(root, "tests/check_export_files.py"), out],
    { encoding: "utf8" },
  );
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});
