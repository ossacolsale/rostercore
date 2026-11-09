import { Quality } from "./quality";
import { OperationalResults } from "./operational-results";
import { isoMonday } from "./evolution-model";
import { useI18n } from "./i18n";
import { useState } from "react";
import {
  type Scenario,
  type Assignment,
  type Result,
  dates,
  rational,
  exact,
  metricNames,
  download,
} from "./model";
import { Text, EntityHeader, Select } from "./editors";
export type Run = (
  action: string,
  extra?: Record<string, unknown>,
) => Promise<Result | undefined>;
const colors = [
  "#20766a",
  "#cf7952",
  "#647ec1",
  "#a879ad",
  "#b19b36",
  "#53738a",
  "#c56c83",
  "#79a362",
];
export function Results({
  s,
  r,
  previous,
  stale,
  run,
  publish,
}: {
  s: Scenario;
  r: Result;
  previous?: Result;
  stale: boolean;
  run: Run;
  publish: () => void;
}) {
  const { t, locale } = useI18n();
  const [through, setThrough] = useState(s.calendar.end),
    [objective, setObjective] = useState(0);
  const [view, setView] = useState("horizon"),
    [focusDate, setFocusDate] = useState(s.calendar.start);
  const allDays = dates(s.calendar.start, s.calendar.end);
  const days = allDays.filter(
      (d) =>
        view === "horizon" ||
        (view === "day" && d === focusDate) ||
        (view === "week" && isoMonday(d) === isoMonday(focusDate)) ||
        (view === "month" && d.slice(0, 7) === focusDate.slice(0, 7)),
    ),
    report = r.fairness?.[objective];
  const employee = (id: string) =>
    s.employees.find((e) => e.id === id)?.label || id;
  const assignments = new Map(
    r.assignments?.map((a) => [`${a.employeeId}:${a.date}`, a.shiftId]),
  );
  const concrete = new Map(
    r.assignments?.map((a) => [a.employeeId + ":" + a.date, a]),
  );
  const states = new Map(
    r.calendarStates?.map((a) => [`${a.employeeId}:${a.date}`, a.state]),
  );
  const peak = Math.max(
    1,
    ...(report?.prefixes.flatMap((p) =>
      p.employees.map((e) => Math.abs(rational(e.debt))),
    ) || []),
  );
  const signature = (a: Assignment) =>
    JSON.stringify([a.shiftId, a.intervals ?? null]);
  const before = new Map(
    previous?.assignments?.map((a) => [
      `${a.employeeId}:${a.date}`,
      signature(a),
    ]),
  );
  const after = new Map(
    r.assignments?.map((a) => [`${a.employeeId}:${a.date}`, signature(a)]),
  );
  const changed =
    r.changes?.length ??
    (previous?.assignments
      ? [...new Set([...before.keys(), ...after.keys()])].filter(
          (key) => before.get(key) !== after.get(key),
        ).length
      : undefined);
  return (
    <>
      <EntityHeader title={t("Schedule & fairness")}>
        <span className={`status ${r.status.toLowerCase()}`}>
          {t(r.status)}
        </span>
      </EntityHeader>
      {stale && (
        <div className="notice">
          {t(
            "Configuration changed since this solve. Results below use the saved solve context. Generate again before publishing or consolidating.",
          )}{" "}
        </div>
      )}
      <Quality s={s} r={r} run={run} stale={stale} />
      <div className="stats">
        <div>
          <span>{t("Assignments")}</span>
          <strong>{r.assignments?.length || 0}</strong>
        </div>
        <div>
          <span>{t("Solve time")}</span>
          <strong>
            {r.metadata?.elapsedSeconds.toLocaleString(locale, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            }) || "—"}
            <small> s</small>
          </strong>
        </div>
        <div>
          <span>{t("Fairness objectives")}</span>
          <strong>{r.fairness?.length || 0}</strong>
        </div>
        <div>
          <span>{t("Changed from previous run")}</span>
          <strong>{changed ?? "—"}</strong>
        </div>
      </div>
      {r.assignments && (
        <>
          <section className="panel">
            <div className="section-head">
              <h3>{t("Assignment calendar")}</h3>
              <button onClick={() => download("rostercore-result.json", r)}>
                {t("Export result JSON")}{" "}
              </button>
            </div>
            <div className="row">
              <Select
                label={t("Calendar view")}
                value={view}
                options={[
                  { id: "horizon", label: t("Whole horizon") },
                  { id: "day", label: t("Day") },
                  { id: "week", label: t("Week") },
                  { id: "month", label: t("Month") },
                ]}
                onChange={setView}
              />
              {view !== "horizon" && (
                <Text
                  label={t("Focus date")}
                  type="date"
                  value={focusDate}
                  onChange={setFocusDate}
                />
              )}
            </div>
            <div className="legend">
              {s.shifts.map((sh, i) => (
                <span key={sh.id}>
                  <i style={{ background: colors[i % colors.length] }} />
                  {sh.label}
                </span>
              ))}
              <span>{t("— Absent / excluded")}</span>
            </div>
            <div className="table-scroll">
              <table className="roster">
                <thead>
                  <tr>
                    <th>{t("Employee")}</th>
                    {days.map((d) => (
                      <th key={d}>
                        <small>
                          {new Date(d + "T12:00:00Z").toLocaleDateString(
                            locale,
                            { weekday: "short", timeZone: "UTC" },
                          )}
                        </small>
                        {new Date(d + "T12:00:00Z").toLocaleDateString(locale, {
                          day: "2-digit",
                          month: "2-digit",
                          timeZone: "UTC",
                        })}
                        <small>
                          {
                            s.weekProfiles?.find(
                              (p) =>
                                p.id ===
                                r.calendarDays?.find((c) => c.date === d)
                                  ?.profileId,
                            )?.label
                          }
                        </small>
                        {r.calendarDays
                          ?.find((c) => c.date === d)
                          ?.holidays.map((h) => (
                            <small
                              className="holiday"
                              key={h.id}
                              title={h.source}
                            >
                              {t(h.label)}
                            </small>
                          ))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.employees.map((e) => (
                    <tr key={e.id}>
                      <th>
                        {e.label}
                        <small>{e.id}</small>
                      </th>
                      {days.map((d) => {
                        const key = `${e.id}:${d}`,
                          sh = s.shifts.find(
                            (x) => x.id === assignments.get(key),
                          ),
                          index = s.shifts.findIndex((x) => x.id === sh?.id);
                        return (
                          <td key={d}>
                            {sh ? (
                              <span
                                className={`shift-cell ${sh.kind === "OFF" ? "rest" : ""}`}
                                style={{
                                  borderColor: colors[index % colors.length],
                                  color: colors[index % colors.length],
                                }}
                                title={
                                  (concrete.get(key)?.intervals || sh.intervals)
                                    .map(
                                      (i) =>
                                        `${i.start}–${i.end}${i.endDayOffset ? t(" +1 day") : ""}`,
                                    )
                                    .join(", ") || t("Scheduled rest")
                                }
                              >
                                {sh.label}
                                <small>
                                  {(
                                    concrete.get(key)?.intervals || sh.intervals
                                  )
                                    .map(
                                      (i) =>
                                        `${i.start}–${i.end}${i.endDayOffset ? " +1" : ""}`,
                                    )
                                    .join(" · ")}
                                </small>
                              </span>
                            ) : (
                              <span
                                className="empty-cell"
                                title={t(states.get(key) || "No assignment")}
                              >
                                {states.get(key) === "ABSENT"
                                  ? t("Absent")
                                  : states.get(key) === "EXCLUDED"
                                    ? t("Excluded")
                                    : states.get(key) === "CLOSED"
                                      ? t("Company closed")
                                      : states.get(key) === "INACTIVE"
                                        ? t("Not in service")
                                        : "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {s.shifts.map((sh) => (
                    <tr key={sh.id}>
                      <th>{t("{shift} coverage", { shift: sh.label })}</th>
                      {days.map((d) => (
                        <td key={d}>
                          {r.assignments?.filter(
                            (a) => a.date === d && a.shiftId === sh.id,
                          ).length || 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          </section>
          {!!r.fairness?.length && (
            <section className="panel">
              <div className="section-head">
                <h3>{t("Continuous fairness")}</h3>
                <select
                  aria-label={t("Displayed fairness objective")}
                  value={objective}
                  onChange={(e) => setObjective(Number(e.target.value))}
                >
                  {r.fairness.map((f, i) => (
                    <option value={i} key={f.objectiveId}>
                      {f.policyId}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint">
                {t(
                  "Debt = cumulative ideal quota − cumulative actual assignments. A positive debt means the employee has received fewer duties than their ideal share.",
                )}{" "}
              </p>
              {report && (
                <>
                  <div className="stats compact">
                    {Object.entries(report.metrics).map(([metric, v]) => (
                      <div key={metric}>
                        <span>{t(metricNames[metric] || metric)}</span>
                        <strong title={exact(v)}>
                          {rational(v).toLocaleString(locale, {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          })}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="chart">
                    <svg
                      viewBox="0 0 900 250"
                      role="img"
                      aria-label={t("Fairness debt trajectory")}
                    >
                      <line
                        x1="45"
                        y1="120"
                        x2="875"
                        y2="120"
                        stroke="#bdcbc6"
                        strokeDasharray="4 5"
                      />
                      <text x="5" y="25">
                        +{peak.toFixed(1)}
                      </text>
                      <text x="22" y="124">
                        0
                      </text>
                      <text x="5" y="225">
                        −{peak.toFixed(1)}
                      </text>
                      {report.employees.map((e, index) => {
                        const points = report.prefixes
                          .map(
                            (p, i) =>
                              `${45 + (i * 830) / Math.max(1, report.prefixes.length - 1)},${120 - (rational(p.employees.find((x) => x.employeeId === e.employeeId)?.debt) * 100) / peak}`,
                          )
                          .join(" ");
                        return (
                          <polyline
                            key={e.employeeId}
                            points={points}
                            fill="none"
                            stroke={colors[index % colors.length]}
                            strokeWidth="2.5"
                          >
                            <title>{employee(e.employeeId)}</title>
                          </polyline>
                        );
                      })}
                      <text x="45" y="246">
                        {report.prefixes[0]?.date}
                      </text>
                      <text x="800" y="246">
                        {report.prefixes.at(-1)?.date}
                      </text>
                    </svg>
                  </div>
                  <div className="legend">
                    {report.employees.map((e, i) => (
                      <span key={e.employeeId}>
                        <i style={{ background: colors[i % colors.length] }} />
                        {employee(e.employeeId)}
                      </span>
                    ))}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Employee")}</th>
                          <th>{t("Historical actual")}</th>
                          <th>{t("Historical debt")}</th>
                          <th>{t("Cumulative ideal")}</th>
                          <th>{t("Cumulative actual")}</th>
                          <th>{t("Residual debt")}</th>
                          <th>{t("Previous debt")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.employees.map((e) => (
                          <tr key={e.employeeId}>
                            <th>{employee(e.employeeId)}</th>
                            <td>{e.initialActual}</td>
                            <td>{exact(e.initialDebt)}</td>
                            <td>{exact(e.ideal)}</td>
                            <td>{e.actual}</td>
                            <td>
                              <span
                                className={
                                  rational(e.debt) > 0 ? "positive" : "muted"
                                }
                              >
                                {exact(e.debt)}
                              </span>
                            </td>
                            <td>
                              {exact(
                                previous?.fairness
                                  ?.find(
                                    (f) => f.objectiveId === report.objectiveId,
                                  )
                                  ?.employees.find(
                                    (x) => x.employeeId === e.employeeId,
                                  )?.debt,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details>
                    <summary>{t("Daily quota and debt details")}</summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("Date")}</th>
                            <th>{t("Employee")}</th>
                            <th>{t("Ideal")}</th>
                            <th>{t("Actual")}</th>
                            <th>{t("Debt")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.prefixes.flatMap((p) =>
                            p.employees.map((e) => (
                              <tr key={p.date + e.employeeId}>
                                <td>{p.date}</td>
                                <td>{employee(e.employeeId)}</td>
                                <td>{exact(e.ideal)}</td>
                                <td>{e.actual}</td>
                                <td>{exact(e.debt)}</td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </section>
          )}
          <section className="panel">
            <h3>{t("Verify, publish & roll forward")}</h3>
            <p className="hint">
              {t(
                "Publishing protects these assignments from silent changes. Consolidating appends the selected prefix to history and advances the planning start date. Export your scenario to keep a portable backup.",
              )}{" "}
            </p>
            <div className="row">
              <button
                disabled={stale}
                onClick={() => run("verify", { result: r })}
              >
                {t("Verify independently")}{" "}
              </button>
              <button disabled={stale} onClick={publish}>
                {t("Publish assignments locally")}{" "}
              </button>
              <Text
                label={t("Consolidate through")}
                type="date"
                value={through}
                onChange={setThrough}
              />
              <button
                disabled={stale}
                onClick={() => run("consolidate", { result: r, through })}
              >
                {t("Consolidate prefix")}{" "}
              </button>
            </div>
          </section>
        </>
      )}
      <OperationalResults s={s} r={r} />
      <section className="panel">
        <h3>{t("Search evidence")}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Policy")}</th>
                <th>{t("Metric")}</th>
                <th>{t("Status")}</th>
                <th>{t("Value")}</th>
                <th>{t("Best bound / scale")}</th>
              </tr>
            </thead>
            <tbody>
              {r.phases?.map((p, i) => (
                <tr key={i}>
                  <td>{p.policyId || "—"}</td>
                  <td>
                    {p.metric.startsWith("FALLBACK_LEVEL_")
                      ? t("Fallback level {level}", {
                          level: p.metric.slice(15),
                        })
                      : t(metricNames[p.metric] || p.metric)}
                  </td>
                  <td>{t(p.status)}</td>
                  <td>{exact(p.value)}</td>
                  <td>
                    {p.bestBoundScaled ?? "—"} / {p.scale ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>{t("Reproducibility metadata")}</summary>
          <pre>{JSON.stringify(r.metadata, null, 2)}</pre>
        </details>
      </section>
    </>
  );
}
