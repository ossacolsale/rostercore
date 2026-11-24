import { useState } from "react";
import type { Run } from "./api";
import type { ScheduleArchive } from "./archives";
import { CalendarChanges } from "./calendar-changes";
import { useI18n } from "./i18n";
import type { Scenario } from "./model";

export function People({ s, archives, archive, run }: {
  s: Scenario;
  archives: ScheduleArchive[];
  archive?: ScheduleArchive;
  run: Run;
}) {
  const { t } = useI18n();
  const [change, setChange] = useState<{ action: string; person?: string }>();
  return (
    <section className="panel">
      <div className="calendar-heading">
        <h2>{t("People")}</h2>
        <div className="row">
          <button onClick={() => setChange({ action: "PERSON" })}>{t("Add a colleague")}</button>
          <button disabled={!s.employees.length} onClick={() => setChange({ action: "ABSENCE" })}>
            {t("Record leave or absence")}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("Person")}</th><th>{t("Role")}</th><th>{t("Absences and leave")}</th><th>{t("Actions")}</th></tr></thead>
          <tbody>
            {s.employees.map((employee) => (
              <tr key={employee.id}>
                <th scope="row">{employee.label}</th>
                <td>{s.employeeTypes.find((role) => role.id === employee.typeId)?.label}</td>
                <td>
                  {s.availability.filter((entry) => entry.selector.employeeIds?.includes(employee.id))
                    .map((entry) => <div key={entry.id}>{entry.scope.start ?? s.calendar.start} – {entry.scope.end ?? s.calendar.end}</div>)}
                </td>
                <td><button onClick={() => setChange({ action: "RENAME", person: employee.id })}>
                  {t("Edit person")}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {change && <CalendarChanges s={s} archive={archive} archives={archives} run={run}
        initialPerson={change.person} initialAction={change.action} peopleOnly
        onClose={() => setChange(undefined)} />}
    </section>
  );
}
