import type { Scenario, Result } from "./model";
import { configurationSteps, stageReport } from "./configuration";
import { useI18n } from "./i18n";
export function ConfigurationGuide({
  s,
  tab,
  onNavigate,
  errorPaths,
  result,
  stale,
}: {
  s: Scenario;
  tab: string;
  onNavigate: (key: string) => void;
  errorPaths: string[];
  result?: Result;
  stale: boolean;
}) {
  const { t } = useI18n();
  const index = configurationSteps.findIndex(([key]) => key === tab);
  if (index < 0) return null;
  const report = (key: string) => {
    const r = stageReport(s, key, errorPaths);
    if (key === "results" && result) {
      r.count = result.assignments?.length ?? 0;
      r.state = stale
        ? "INCOMPLETE"
        : ["OPTIMAL", "FEASIBLE"].includes(result.status)
          ? "LOCALLY_COHERENT"
          : ["MODEL_INVALID", "INFEASIBLE", "VALIDATION_ERROR"].includes(
                result.status,
              )
            ? "DETECTED_ERROR"
            : "INCOMPLETE";
    }
    return r;
  };
  const current = report(tab);
  return (
    <section className="guided-step" aria-label={t("Guided configuration")}>
      <div className="row">
        <div>
          <span className="step-index">
            {t("Configuration step {step} of {total}", {
              step: index + 1,
              total: configurationSteps.length,
            })}
          </span>
          <p>
            <strong>{t(configurationSteps[index][1])}</strong> ·{" "}
            <span className="badge">{t(current.state)}</span>
          </p>
        </div>
        <div className="row">
          <button
            disabled={!index}
            onClick={() => onNavigate(configurationSteps[index - 1][0])}
          >
            {t("Previous step")}
          </button>
          <button
            disabled={index === configurationSteps.length - 1}
            onClick={() => onNavigate(configurationSteps[index + 1][0])}
          >
            {t("Next step")}
          </button>
        </div>
      </div>
      {current.issues.map((issue) => (
        <p className="stage-issues" key={issue}>
          {t(issue)}
        </p>
      ))}
      <details>
        <summary>{t("Configuration progress and dependencies")}</summary>
        <p className="hint">
          {t(
            "Local checks guide editing. Use full core validation before generating; optional sections can remain empty.",
          )}
        </p>
        <div className="stage-list">
          {configurationSteps.map(([key, label]) => {
            const stage = report(key);
            return (
              <button key={key} onClick={() => onNavigate(key)}>
                {t(label)}
                <span className="stage-state">
                  {t(stage.state)} ·{" "}
                  {t("Defined items: {count}", { count: stage.count })}
                </span>
              </button>
            );
          })}
        </div>
      </details>
    </section>
  );
}
