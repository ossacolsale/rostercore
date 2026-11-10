import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { zipSync, strToU8 } from "fflate";
import {
  calendarPrintView,
  type CalendarView,
  type CalendarCell,
  type Presentation,
  stateKeys,
  stateSymbols,
  cellText,
  archiveStatus,
  filename,
} from "./calendar-export-model";
import type { Translate } from "./i18n";
export type PdfText = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  color?: "muted" | "warning";
};
export type PdfRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: "header" | "alternate" | "white";
};
export type PdfPagePlan = {
  width: number;
  height: number;
  texts: PdfText[];
  rects: PdfRect[];
};
export type PdfExport = { bytes: Uint8Array; pages: PdfPagePlan[] };
const ink = rgb(0.09, 0.21, 0.19),
  muted = rgb(0.28, 0.34, 0.32),
  warning = rgb(0.5, 0.2, 0.06);
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const output: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const together = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(together, size) <= width) {
        line = together;
        continue;
      }
      if (line) {
        output.push(line);
        line = "";
      }
      for (const character of word) {
        if (font.widthOfTextAtSize(line + character, size) > width && line) {
          output.push(line);
          line = "";
        }
        line += character;
      }
    }
    output.push(line);
  }
  return output;
}
export async function generatePdf(
  view: CalendarView,
  options: Presentation,
  t: Translate,
  fonts: { regular: Uint8Array; bold: Uint8Array },
  generatedAt = new Date(),
): Promise<PdfExport> {
  view = calendarPrintView(view, options);
  if (!view.days.length)
    throw new Error(
      t(
        "No days remain for printing. Include at least one day category or change the period.",
      ),
    );
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true }),
    bold = await doc.embedFont(fonts.bold, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  const ensure = (text: string) => {
    for (const c of text)
      if (c !== "\n" && c !== "\r" && !supported.has(c.codePointAt(0)!))
        throw new Error(
          t(
            "The PDF font cannot display a character in this calendar. Use CSV or iCalendar, or change the label.",
          ),
        );
  };
  const landscape =
    options.orientation === "LANDSCAPE" ||
    (options.orientation === "AUTO" &&
      (view.employees.length > 1 || options.layout !== "PERSON"));
  const paper = options.paper === "A3" ? [841.89, 1190.55] : [595.28, 841.89];
  const [width, height] = landscape ? [paper[1], paper[0]] : paper;
  const margin = 30,
    lineHeight = 12,
    size = 9;
  const pages: PdfPagePlan[] = [];
  let page!: PdfPagePlan,
    y = 0;
  const aliases = new Map<string, string>(),
    used = new Set<string>(Object.values(stateSymbols));
  for (const cell of view.cells)
    if (cell.shiftId && !aliases.has(cell.shiftId)) {
      const label = cell.shiftLabel ?? "";
      let alias =
        label.length <= 13
          ? label
          : label
              .split(/[\s_\-/]+/)
              .filter(Boolean)
              .map((s) => Array.from(s)[0])
              .join("")
              .slice(0, 8) || "S";
      const base = alias;
      let n = 1;
      while (used.has(alias)) alias = base + ++n;
      used.add(alias);
      aliases.set(cell.shiftId, alias);
    }
  const text = (
    value: string,
    x: number,
    at: number,
    fs = size,
    strong = false,
    color?: PdfText["color"],
  ) => {
    ensure(value);
    page.texts.push({ text: value, x, y: at, size: fs, bold: strong, color });
  };
  const rows = (
    value: string,
    x: number,
    w: number,
    fs = size,
    strong = false,
    color?: PdfText["color"],
  ) => {
    const lines = wrap(value, strong ? bold : regular, fs, w);
    for (const line of lines) {
      text(line, x, y, fs, strong, color);
      y += Math.max(lineHeight, fs + 3);
    }
    return lines.length;
  };
  const newPage = (section: string) => {
    if (pages.length >= 1000)
      throw new Error(
        t(
          "This PDF exceeds 1,000 pages. Select a shorter period or fewer people.",
        ),
      );
    page = { width, height, texts: [], rects: [] };
    pages.push(page);
    y = margin;
    rows(
      options.business || view.scenarioLabel,
      margin,
      width - 2 * margin,
      11,
      true,
    );
    if (options.business && options.business !== view.scenarioLabel)
      rows(view.scenarioLabel, margin, width - 2 * margin, 9, false, "muted");
    rows(
      options.title || t("Work schedule"),
      margin,
      width - 2 * margin,
      15,
      true,
    );
    rows(
      `${view.period.start} - ${view.period.end} | ${archiveStatus(view, t)}`,
      margin,
      width - 2 * margin,
      9,
      false,
    );
    rows(
      t("Times in {zone}", { zone: view.timezone }),
      margin,
      width - 2 * margin,
      8,
      false,
      "muted",
    );
    rows(
      `${t("Document generated")}: ${generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      margin,
      width - 2 * margin,
      8,
      false,
      "muted",
    );
    if (options.showPublishedDate)
      rows(
        t("Publication date") + ": " + (view.publishedAt ?? t("Not recorded")),
        margin,
        width - 2 * margin,
        8,
        false,
        "muted",
      );
    if (options.showRevision)
      rows(
        t("Revision") + ": " + view.scenarioRevision + "." + view.revision,
        margin,
        width - 2 * margin,
        8,
        false,
        "muted",
      );
    if (view.preferencesUnproved)
      rows(
        t("Usable calendar; some preferences may still be improved."),
        margin,
        width - 2 * margin,
        9,
        false,
        "warning",
      );
    rows(section, margin, width - 2 * margin, 10, true);
    y += 5;
    if (y > height - 110)
      throw new Error(
        t(
          "The document heading is too long. Shorten the title or business name.",
        ),
      );
  };
  const reserve = () => height - margin - 22;
  const matrix = new Map(
    view.cells.map((c) => [c.employeeId + ":" + c.date, c]),
  );
  const groupDates = () => {
    const groups: string[][] = [];
    for (const day of view.days) {
      const date = day.date;
      const key =
        options.layout === "MONTH"
          ? date.slice(0, 7)
          : (() => {
              const d = new Date(date + "T12:00:00Z");
              d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay() || 7));
              return d.toISOString().slice(0, 10);
            })();
      const last = groups[groups.length - 1];
      if (
        last &&
        (options.layout === "MONTH"
          ? last[0].slice(0, 7) === key
          : (() => {
              const d = new Date(last[0] + "T12:00:00Z");
              d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay() || 7));
              return d.toISOString().slice(0, 10) === key;
            })())
      )
        last.push(date);
      else groups.push([date]);
    }
    return groups;
  };
  if (options.layout === "PERSON") {
    for (const employee of view.employees) {
      const section = employee.label;
      newPage(section);
      for (const day of view.days) {
        const cell = matrix.get(employee.id + ":" + day.date)!;
        const value =
          day.date +
          "  " +
          cellText(cell, t, options.mode === "COMPLETE") +
          (day.holidays.length
            ? "\n" + day.holidays.map((h) => h.label).join(", ")
            : "");
        const lines = wrap(value, regular, size, width - 2 * margin - 12);
        let offset = 0;
        while (offset < lines.length) {
          if (y + lineHeight + 12 > reserve())
            newPage(section + " - " + t("continued"));
          const count = Math.min(
            lines.length - offset,
            Math.max(1, Math.floor((reserve() - y - 12) / lineHeight)),
          );
          page.rects.push({
            x: margin,
            y: y - 3,
            width: width - 2 * margin,
            height: count * lineHeight + 8,
            fill: "alternate",
          });
          for (const line of lines.slice(offset, offset + count)) {
            text(line, margin + 6, y);
            y += lineHeight;
          }
          y += 12;
          offset += count;
        }
      }
    }
  } else {
    const nameWidth = Math.max(110, Math.min(155, (width - 2 * margin) * 0.22)),
      minColumn = options.mode === "COMPLETE" ? 86 : 53,
      maxColumns = Math.max(
        1,
        Math.floor((width - 2 * margin - nameWidth) / minColumn),
      );
    for (const group of groupDates())
      for (let at = 0; at < group.length; at += maxColumns) {
        const days = group.slice(at, at + maxColumns),
          columnWidth = (width - 2 * margin - nameWidth) / days.length;
        const section =
          (options.layout === "MONTH" ? t("Month") : t("Week")) +
          " " +
          group[0].slice(0, options.layout === "MONTH" ? 7 : 10) +
          " | " +
          days[0] +
          " - " +
          days[days.length - 1];
        const heading = () => {
          const data = [
            t("Employee"),
            ...days.map((d) => {
              const day = view.days.find((x) => x.date === d)!;
              return (
                new Date(d + "T12:00:00Z").toLocaleDateString(
                  options.language === "it" ? "it-IT" : "en-GB",
                  {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: "UTC",
                  },
                ) + (day.holidays.length ? "\n" + t("Holiday") : "")
              );
            }),
          ];
          const lines = data.map((v, i) =>
            wrap(v, bold, 8, (i ? columnWidth : nameWidth) - 10),
          );
          const h = Math.max(...lines.map((x) => x.length)) * 11 + 10;
          page.rects.push({
            x: margin,
            y: y - 4,
            width: width - 2 * margin,
            height: h,
            fill: "header",
          });
          lines.forEach((ls, i) =>
            ls.forEach((line, k) =>
              text(
                line,
                margin + (i ? nameWidth + (i - 1) * columnWidth : 0) + 5,
                y + k * 11,
                8,
                true,
              ),
            ),
          );
          y += h;
        };
        newPage(section);
        heading();
        for (let row = 0; row < view.employees.length; row++) {
          const employee = view.employees[row];
          const data = [
            employee.label,
            ...days.map((d) => {
              const c = matrix.get(employee.id + ":" + d)!;
              if (c.state === "WORKING")
                return (
                  (aliases.get(c.shiftId!) ?? c.shiftLabel ?? "") +
                  (options.mode === "COMPLETE"
                    ? "\n" +
                      c.intervals
                        .map(
                          (i) =>
                            i.start +
                            "-" +
                            i.end +
                            (i.endDayOffset ? " " + t("(+1 day)") : ""),
                        )
                        .join("\n")
                    : "")
                );
              return (
                (stateSymbols[c.state] ?? "?") +
                (c.absenceReasons?.length
                  ? "\n" + c.absenceReasons.join(", ")
                  : "")
              );
            }),
          ];
          const lines = data.map((v, i) =>
            wrap(v, regular, size, (i ? columnWidth : nameWidth) - 10),
          );
          const maximum = Math.max(...lines.map((x) => x.length));
          let offset = 0;
          while (offset < maximum) {
            if (y + lineHeight + 12 > reserve()) {
              newPage(section + " - " + t("continued"));
              heading();
            }
            const capacity = Math.max(
                1,
                Math.floor((reserve() - y - 12) / lineHeight),
              ),
              count = Math.min(maximum - offset, capacity);
            page.rects.push({
              x: margin,
              y: y - 3,
              width: width - 2 * margin,
              height: count * lineHeight + 10,
              fill: row % 2 ? "alternate" : "white",
            });
            lines.forEach((ls, i) =>
              ls
                .slice(offset, offset + count)
                .forEach((line, k) =>
                  text(
                    line,
                    margin + (i ? nameWidth + (i - 1) * columnWidth : 0) + 5,
                    y + k * lineHeight,
                  ),
                ),
            );
            y += count * lineHeight + 12;
            offset += count;
            if (offset < maximum) {
              newPage(
                section + " - " + employee.label + " - " + t("continued"),
              );
              heading();
            }
          }
        }
      }
  }
  if (!pages.length) newPage(t("No people selected"));
  const legend = [...aliases.entries()].map(
    ([id, alias]) =>
      alias +
      " = " +
      (view.cells.find((c) => c.shiftId === id)?.shiftLabel ?? ""),
  );
  for (const state of [
    ...new Set(
      view.cells.filter((c) => c.state !== "WORKING").map((c) => c.state),
    ),
  ])
    legend.push(
      (stateSymbols[state] ?? "?") +
        " = " +
        t(stateKeys[state] ?? "Not planned"),
    );
  const append = (heading: string, items: string[]) => {
    if (y + 36 > reserve()) newPage(heading);
    rows(heading, margin, width - 2 * margin, 10, true);
    for (const item of items) {
      for (const line of wrap(item, regular, size, width - 2 * margin)) {
        if (y + lineHeight > reserve())
          newPage(heading + " - " + t("continued"));
        text(line, margin, y);
        y += lineHeight;
      }
      y += 3;
    }
  };
  append(t("Legend"), legend);
  const holidays = view.days
    .filter((day) => day.holidays.length)
    .map(
      (day) => day.date + " - " + day.holidays.map((h) => h.label).join(", "),
    );
  if (holidays.length) append(t("Holidays"), holidays);
  if (options.notes.trim())
    append(t("Operational notes"), [options.notes.trim()]);
  for (let i = 0; i < pages.length; i++) {
    page = pages[i];
    text(
      `${t("Page")} ${i + 1} / ${pages.length}`,
      margin,
      height - margin,
      8,
      false,
      "muted",
    );
    for (const item of page.texts)
      if (
        item.x < margin - 1 ||
        item.x +
          (item.bold ? bold : regular).widthOfTextAtSize(item.text, item.size) >
          width - margin + 1 ||
        item.y < 0 ||
        item.y > height - margin + 1
      )
        throw new Error(
          t("PDF layout exceeds the page. Select another layout."),
        );
    const pdf = doc.addPage([page.width, page.height]);
    for (const rect of page.rects)
      pdf.drawRectangle({
        x: rect.x,
        y: height - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
        color:
          rect.fill === "header"
            ? rgb(0.86, 0.92, 0.89)
            : rect.fill === "alternate"
              ? rgb(0.96, 0.97, 0.96)
              : rgb(1, 1, 1),
        borderWidth: 0.3,
        borderColor: rgb(0.78, 0.83, 0.8),
      });
    for (const item of page.texts)
      pdf.drawText(item.text, {
        x: item.x,
        y: height - item.y - item.size,
        size: item.size,
        font: item.bold ? bold : regular,
        color:
          item.color === "muted"
            ? muted
            : item.color === "warning"
              ? warning
              : ink,
      });
  }
  doc.setTitle(options.title || view.scenarioLabel);
  doc.setCreator("RosterCore");
  doc.setCreationDate(generatedAt);
  return { bytes: await doc.save(), pages };
}
const escapeIcs = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
export function foldIcs(line: string) {
  const encoder = new TextEncoder();
  let out = "",
    current = "",
    n = 0;
  for (const ch of line) {
    const len = encoder.encode(ch).length;
    if (n + len > 75) {
      out += current + "\r\n";
      current = " ";
      n = 1;
    }
    current += ch;
    n += len;
  }
  return out + current;
}
const stamp = (time: Date) =>
  time
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const nextDate = (day: string) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
};
export function generateIcs(
  view: CalendarView,
  options: Presentation,
  t: Translate,
  employeeId?: string,
  generatedAt = new Date(),
) {
  const individual = employeeId !== undefined;
  const people = new Map(
    view.employees
      .filter((e) => !individual || e.id === employeeId)
      .map((e) => [e.id, e.label]),
  );
  if (individual && !people.size)
    throw new Error(t("Choose a person from the current selection."));
  const modified = new Date(view.lastModified),
    lastModified = Number.isNaN(modified.getTime()) ? generatedAt : modified;
  const sequence = view.scenarioRevision + view.revision;
  if (!Number.isSafeInteger(sequence) || sequence > 2147483647)
    throw new Error(
      t("Calendar revision exceeds the iCalendar sequence limit."),
    );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RosterCore//Calendar export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" +
      escapeIcs(
        individual
          ? people.get(employeeId!)!
          : options.title || view.scenarioLabel,
      ),
  ];
  for (const cell of view.cells) {
    if (
      !people.has(cell.employeeId) ||
      !["WORKING", "REST", "ABSENT", "CLOSED"].includes(cell.state)
    )
      continue;
    const label =
      cell.state === "WORKING"
        ? (cell.shiftLabel ?? "")
        : t(stateKeys[cell.state]);
    const title =
      label + (individual ? "" : " - " + people.get(cell.employeeId));
    const status =
      cell.lifecycle === "DRAFT"
        ? "TENTATIVE"
        : cell.lifecycle === "SUPERSEDED"
          ? "CANCELLED"
          : "CONFIRMED";
    const common = (uid: string) => [
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + stamp(generatedAt),
      "LAST-MODIFIED:" + stamp(lastModified),
      "SEQUENCE:" + sequence,
      "SUMMARY:" + escapeIcs(title),
      "STATUS:" + status,
      "X-ROSTERCORE-STATE:" + cell.lifecycle,
    ];
    if (cell.state === "WORKING") {
      for (let i = 0; i < cell.intervals.length; i++) {
        const interval = cell.intervals[i];
        if (
          interval.startUtcMinute === undefined ||
          interval.endUtcMinute === undefined
        )
          throw new Error(
            t(
              "iCalendar needs a supported time zone and resolved daylight-saving times. Check the calendar time details.",
            ),
          );
        const row = common(interval.uid);
        row.push(
          "DTSTART:" + stamp(new Date(interval.startUtcMinute * 60000)),
          "DTEND:" + stamp(new Date(interval.endUtcMinute * 60000)),
        );
        if (cell.intervals.length > 1)
          row.push(
            "RELATED-TO;RELTYPE=SIBLING:" + cell.intervals[i ? 0 : 1].uid,
          );
        if (options.includeTimesInDescription)
          row.push(
            "DESCRIPTION:" +
              escapeIcs(
                cellText(cell, t, true) +
                  "\n" +
                  view.timezone +
                  " | " +
                  t(
                    cell.lifecycle === "COMPLETED"
                      ? "Work confirmed"
                      : cell.lifecycle === "PUBLISHED"
                        ? "Published calendar"
                        : cell.lifecycle === "SUPERSEDED"
                          ? "Superseded calendar"
                          : "Draft calendar",
                  ),
              ),
          );
        row.push("END:VEVENT");
        lines.push(...row);
      }
    } else {
      const row = common(cell.uid);
      row.push(
        "DTSTART;VALUE=DATE:" + cell.date.replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + nextDate(cell.date),
        "TRANSP:TRANSPARENT",
      );
      if (cell.absenceReasons?.length)
        row.push("DESCRIPTION:" + escapeIcs(cell.absenceReasons.join(", ")));
      row.push("END:VEVENT");
      lines.push(...row);
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcs).join("\r\n") + "\r\n";
}
export function individualCalendars(
  view: CalendarView,
  options: Presentation,
  t: Translate,
  generatedAt = new Date(),
) {
  const files: Record<string, Uint8Array> = Object.create(null);
  const used = new Set<string>();
  for (const employee of view.employees) {
    let name = filename(employee.label),
      base = name,
      n = 1;
    while (used.has(name.toLowerCase())) name = base + "-" + ++n;
    used.add(name.toLowerCase());
    files[name + ".ics"] = strToU8(
      generateIcs(view, options, t, employee.id, generatedAt),
    );
  }
  return files;
}
export function calendarZip(
  view: CalendarView,
  options: Presentation,
  t: Translate,
  generatedAt = new Date(),
) {
  return zipSync(individualCalendars(view, options, t, generatedAt), {
    level: 6,
  });
}
