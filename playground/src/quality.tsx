import { useState } from "react";
import { type Scenario, type Result } from "./model";
import { type Run } from "./results";
import { Text } from "./editors";
import { useI18n } from "./i18n";
export function Quality({
  s,
  r,
  run,
  stale,
}: {
  s: Scenario;
  r: Result;
  run: Run;
  stale: boolean;
}) {
  const { t } = useI18n();
  const [audit, setAudit] = useState<Result>(),
    [budget, setBudget] = useState(
      Math.min(600, Math.max(30, s.search.maxTimeSeconds * 2)),
    );
  const quality = audit?.quality ?? r.quality;
  if (!r.assignments) return null;
  return (
    <section
      className={
        "panel " +
        (quality?.fallback.status === "PROVED_MINIMUM"
          ? "quality-proof"
          : "quality-provisional")
      }
    >
      <h2>{t("Calendar quality")}</h2>
      <p>
        <strong>
          {t("Substitute assignments")}:{" "}
          {quality?.fallback.totalSubstitutions ?? "—"}
        </strong>{" "}
        ·{" "}
        {t(
          quality?.fallback.status === "PROVED_MINIMUM"
            ? "Minimum proved for configured fallback priorities"
            : "Provisional: fewer substitutes may still be possible",
        )}
      </p>
      <p className="hint">
        {t(
          "A feasible calendar satisfies hard rules. Only an optimal phase or an independent counterfactual proves its minimum. Later fairness and spacing cannot worsen a proved earlier priority.",
        )}
      </p>
      {quality?.fallback.stages?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Preference tier")}</th>
                <th>{t("Current count")}</th>
                <th>{t("Proved lower bound")}</th>
                <th>{t("Proof")}</th>
              </tr>
            </thead>
            <tbody>
              {quality.fallback.stages.map((p, i) => (
                <tr key={i}>
                  <td>{p.minimumLevel}</td>
                  <td>{p.incumbent}</td>
                  <td>{p.lowerBound ?? "—"}</td>
                  <td>{t(p.provedMinimum ? "Proved minimum" : "Unproved")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="row">
        <button
          onClick={async () => {
            const result = await run("verify-quality", {
              scenario: s,
              result: r,
              budget: 15,
            });
            if (result) setAudit(result);
          }}
        >
          {t("Independently check substitute minimum")}
        </button>
        <Text
          label={t("Additional search budget, seconds")}
          type="number"
          value={budget}
          onChange={(v) => setBudget(Math.min(600, Math.max(0, Number(v))))}
        />
        <button
          disabled={stale}
          onClick={() =>
            run("improve", {
              document: {
                previousScenario: s,
                previousResult: r,
                maxTimeSeconds: budget,
              },
            })
          }
        >
          {t("Search longer using this calendar")}
        </button>
      </div>
      <p className="hint">
        {t(
          "Search restarts with verified assignments as a hint. It retains a verified incumbent when the new budget finds no improvement. Revise an official calendar before changing it.",
        )}
      </p>
      {audit && <p role="status">{t(audit.status)}</p>}
      {quality?.substitutions?.length ? (
        <details>
          <summary>{t("Why are substitutes used?")}</summary>
          {quality.substitutions.map((row, i) => (
            <p key={i}>
              {row.date} ·{" "}
              {s.employees.find((e) => e.id === row.employeeId)?.label ??
                row.employeeId}{" "}
              ·{" "}
              {s.dutyRequirements?.find((d) => d.id === row.requirementId)
                ?.label ?? row.requirementId}
              :{" "}
              {t(
                row.minimumProved
                  ? "The configured global minimum is proved; this does not prove that this particular person is individually unavoidable."
                  : "This is a feasible substitution; necessity has not been proved. A longer search may avoid it.",
              )}
            </p>
          ))}
        </details>
      ) : null}
      {r.workload?.length ? (
        <>
          <h3>{t("Combined burden and spacing")}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Employee")}</th>
                  <th>{t("Category")}</th>
                  <th>{t("Total duties")}</th>
                  <th>{t("By duty type")}</th>
                  <th>{t("Minimum calendar gap")}</th>
                  <th>{t("Actual normal-work gap")}</th>
                  <th>{t("Consecutive pairs")}</th>
                  <th>{t("Close pairs")}</th>
                </tr>
              </thead>
              <tbody>
                {r.workload.map((row, i) => (
                  <tr key={i}>
                    <td>
                      {s.employees.find((e) => e.id === row.employeeId)
                        ?.label ?? row.employeeId}
                    </td>
                    <td>
                      {s.spacingRules?.find((x) => x.id === row.ruleId)
                        ?.label ?? row.ruleId}
                    </td>
                    <td>{row.totalBurden}</td>
                    <td>
                      {Object.entries(row.byShift)
                        .map(
                          ([shift, n]) =>
                            (s.shifts.find((x) => x.id === shift)?.label ??
                              shift) +
                            ": " +
                            n,
                        )
                        .join(", ")}
                    </td>
                    <td>{row.minimumCalendarGap ?? "—"}</td>
                    <td>{row.minimumNormalWorkGap ?? "—"}</td>
                    <td>{row.consecutivePairs}</td>
                    <td>{row.closePairs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {t(
              "Soft spacing can remain imperfect because of earlier priorities or an unfinished search. This report describes the assignments and does not invent an infeasibility explanation.",
            )}
          </p>
        </>
      ) : null}
      <details className="advanced-only">
        <summary>{t("Optimization phases and bounds")}</summary>
        <pre>{JSON.stringify(r.phases, null, 2)}</pre>
      </details>
    </section>
  );
}
