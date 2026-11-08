import type { Scenario, Result } from "./model";
import { useI18n } from "./i18n";
export function OperationalResults({ s, r }: { s: Scenario; r: Result }) {
  const { t } = useI18n();
  const employee = (id: string) =>
    s.employees.find((e) => e.id === id)?.label || id;
  return (
    <>
      {!!r.weekAssignments?.some((w) => w.profileId) && (
        <section className="panel">
          <h3>{t("Chosen week profiles and origins")}</h3>
          <div className="week-preview">
            {r.weekAssignments.map((w) => (
              <article className="item-card" key={w.week}>
                <strong>
                  {w.isoWeek} · {w.week}
                </strong>
                <p>
                  {s.weekProfiles?.find((p) => p.id === w.profileId)?.label ||
                    w.profileId}{" "}
                  · {t(w.origin)}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
      {!!r.coverage?.length && (
        <section className="panel">
          <h3>{t("Operational coverage and substitutions")}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Responsibility")}</th>
                  <th>{t("Employee")}</th>
                  <th>{t("Resource level")}</th>
                </tr>
              </thead>
              <tbody>
                {r.coverage.flatMap((row) =>
                  row.people.map((person, i) => (
                    <tr key={`${row.requirementId}:${row.date}:${i}`}>
                      <td>{row.date}</td>
                      <th>{row.label}</th>
                      <td>{employee(person.employeeId)}</td>
                      <td>
                        {person.substitution ? (
                          <span className="badge fallback">
                            {t("Fallback")} · {person.level}
                          </span>
                        ) : (
                          t("Primary")
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {r.changes && (
        <section className="panel">
          <h3>{t("Regeneration changes")}</h3>
          <p className="hint">
            {t("Changed assignments: {count}", { count: r.changes.length })}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Employee")}</th>
                  <th>{t("Before")}</th>
                  <th>{t("After")}</th>
                </tr>
              </thead>
              <tbody>
                {r.changes.map((c) => (
                  <tr key={c.employeeId + c.date}>
                    <td>{c.date}</td>
                    <th>{employee(c.employeeId)}</th>
                    <td>
                      {s.shifts.find((sh) => sh.id === c.beforeShiftId)
                        ?.label ||
                        c.beforeShiftId ||
                        "—"}
                      <small>
                        {c.beforeIntervals
                          ?.map(
                            (x) =>
                              `${x.start}–${x.end}${x.endDayOffset ? " +1" : ""}`,
                          )
                          .join(", ")}
                      </small>
                    </td>
                    <td>
                      {s.shifts.find((sh) => sh.id === c.afterShiftId)?.label ||
                        c.afterShiftId ||
                        t("No assignment")}
                      <small>
                        {c.afterIntervals
                          ?.map(
                            (x) =>
                              `${x.start}–${x.end}${x.endDayOffset ? " +1" : ""}`,
                          )
                          .join(", ")}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
