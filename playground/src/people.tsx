import { useState } from "react";
import type { Run } from "./api";
import type { ScheduleArchive } from "./archives";
import { CalendarChanges } from "./calendar-changes";
import { Icon } from "./icons";
import { useI18n } from "./i18n";
import type { Scenario } from "./model";

export function People({ s, archives, archive, run }: {
  s: Scenario;
  archives: ScheduleArchive[];
  archive?: ScheduleArchive;
  run: Run;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [change, setChange] = useState<{ action: string; person?: string }>();
  return (
    <section>
      <div className="page-heading">
        <h1>{t("People")}</h1>
        <div className="row">
          <button disabled={!s.employees.length} onClick={() => setChange({ action: "ABSENCE" })}>
            {t("Record leave or absence")}
          </button>
          <button className="primary" onClick={() => setChange({ action: "PERSON" })}><Icon name="plus" />{t("Add a colleague")}</button>
        </div>
      </div>
      {s.employees.length > 8 && <label className="field people-search"><span>{t("Find a person")}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>}
      {!s.employees.length && <p className="panel">{t("Add a colleague to start planning.")}</p>}
      {s.employees.length > 0 && <div className="people-table table-scroll" role="region" aria-label={t("People")} tabIndex={0}>
        <table>
          <thead><tr><th>{t("Person")}</th><th>{t("Role")}</th><th>{t("Absences and leave")}</th><th>{t("Actions")}</th></tr></thead>
          <tbody>
            {s.employees.filter((person) => person.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((employee) => (
              <tr key={employee.id}>
                <th scope="row">{employee.label}</th>
                <td>{s.employeeTypes.find((role) => role.id === employee.typeId)?.label}</td>
                <td>
                  {s.availability.filter((entry) => entry.selector.employeeIds?.includes(employee.id))
                    .map((entry) => <div key={entry.id}>{entry.scope.start ?? s.calendar.start} – {entry.scope.end ?? s.calendar.end}</div>)}
                </td>
                <td><button className="quiet" onClick={() => setChange({ action: "RENAME", person: employee.id })}>
                  <Icon name="edit" />{t("Edit person")}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {change && <CalendarChanges s={s} archive={archive} archives={archives} run={run}
        initialPerson={change.person} initialAction={change.action} peopleOnly
        onClose={() => setChange(undefined)} />}
    </section>
  );
}
