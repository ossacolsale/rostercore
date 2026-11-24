import { useState } from "react";
import {
  type CalendarView,
  type CalendarCell,
  type Presentation,
  cellText,
  stateKeys,
  stateSymbols,
} from "./calendar-export-model";
import type { PdfPagePlan } from "./calendar-files";
import { useI18n } from "./i18n";
export function CalendarGrid({
  view,
  mode = "COMPLETE",
  onCell,
  dutyIds,
}: {
  view: CalendarView;
  mode?: Presentation["mode"];
  dutyIds?: Set<string>;
  onCell?: (cell: CalendarCell) => void;
}) {
  const { t, locale } = useI18n();
  const cells = new Map(
    view.cells.map((c) => [c.employeeId + ":" + c.date, c]),
  );
  const variedProfiles = new Set(view.days.map((day) => day.profileLabel)).size > 1;
  const weekStart = (date: string) => new Date(date + "T12:00:00Z").getUTCDay() === 1;
  return (
    <>
      <div className="calendar-grid-scroll table-scroll" tabIndex={0} role="region" aria-label={t("Shift grid")}>
        <table className="roster filtered-calendar">
          <thead>
            <tr>
              <th scope="col">{t("People")}</th>
              {view.days.map((day) => (
                <th scope="col" key={day.date} data-week-start={weekStart(day.date) || undefined}>
                  <small>
                    {new Date(day.date + "T12:00:00Z").toLocaleDateString(
                      locale,
                      { weekday: "short", timeZone: "UTC" },
                    )}
                  </small>
                  <span>{new Date(day.date + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                  {variedProfiles && <small>{day.profileLabel}</small>}
                  {day.holidays.length > 0 && (
                    <small title={day.holidays.map((h) => h.label).join(", ")}>
                      {t("Holiday")}
                    </small>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.employees.map((employee) => (
              <tr key={employee.id}>
                <th scope="row">{employee.label}</th>
                {view.days.map((day) => {
                  const cell = cells.get(employee.id + ":" + day.date)!;
                  const working = cell.state === "WORKING";
                  const content = <span className={working ?
                    (cell.shiftId && dutyIds?.has(cell.shiftId) ? "shift-block duty" : "shift-block") : "cell-state"}>
                    <span>{working ? cell.shiftLabel : t(stateKeys[cell.state] ?? "Not planned")}</span>
                    {mode === "COMPLETE" && working && <small>
                      {cell.intervals.map((i) => `${i.start}–${i.end}${i.endDayOffset ? " +1" : ""}`).join(" / ")}
                    </small>}
                  </span>;
                  return (
                    <td
                      key={day.date}
                      data-week-start={weekStart(day.date) || undefined}
                      className={"calendar-state-" + cell.state.toLowerCase()}
                    >
                      {onCell ? (
                        <button
                          className="calendar-cell-button"
                          aria-label={`${employee.label}, ${day.date}: ${cellText(cell, t, true)}`}
                          onClick={() => onCell(cell)}
                        >
                          {content}
                        </button>
                      ) : (
                        <span title={cellText(cell, t, true)}>{content}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="calendar-legend">
        <summary>{t("Calendar legend")}</summary>
        <ul>
          {[
            ...new Set(
              view.cells
                .filter((c) => c.state !== "WORKING")
                .map((c) => c.state),
            ),
          ].map((state) => (
            <li key={state}>
              <b>{stateSymbols[state] ?? "?"}</b>{" "}
              {t(stateKeys[state] ?? "Not planned")}
            </li>
          ))}
        </ul>
        <p>
          {t("Filtered assignments are hidden in this view.")}
        </p>
      </details>
    </>
  );
}
export function PdfPreview({ pages }: { pages: PdfPagePlan[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const at = Math.min(index, pages.length - 1),
    page = pages[at];
  if (!page) return null;
  return (
    <section className="pdf-preview-section">
      <div className="row">
        <strong>
          {t("PDF preview - {count} pages", { count: pages.length })}
        </strong>
        <button disabled={at <= 0} onClick={() => setIndex(at - 1)}>
          {t("Previous page")}
        </button>
        <span>
          {at + 1} / {pages.length}
        </span>
        <button
          disabled={at >= pages.length - 1}
          onClick={() => setIndex(at + 1)}
        >
          {t("Next page")}
        </button>
      </div>
      <div className="pdf-preview-scroll">
        <svg
          className="pdf-preview"
          viewBox={`0 0 ${page.width} ${page.height}`}
          role="img"
          aria-label={t("PDF page {page}", { page: at + 1 })}
        >
          <rect width={page.width} height={page.height} fill="white" />
          {page.rects.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill={
                r.fill === "header"
                  ? "#dbeae3"
                  : r.fill === "alternate"
                    ? "#f5f7f5"
                    : "#fff"
              }
              stroke="#c8d4cc"
              strokeWidth=".3"
            />
          ))}
          {page.texts.map((item, i) => (
            <text
              key={i}
              x={item.x}
              y={item.y + item.size}
              fontSize={item.size}
              fontWeight={item.bold ? 700 : 400}
              fill={
                item.color === "warning"
                  ? "#80330f"
                  : item.color === "muted"
                    ? "#475751"
                    : "#173630"
              }
            >
              {item.text}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
