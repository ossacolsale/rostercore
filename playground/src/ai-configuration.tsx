import { useState } from "react";
import { type Scenario, type Result, download } from "./model";
import { type Run } from "./results";
import { ReviewDialog } from "./pattern-assignments";
import { useI18n } from "./i18n";
import { notifyError,notifyResult } from "./notifications";
import { coreAction } from "./api";
export function AIConfiguration({
  s,
  run,
  busy,
}: {
  s: Scenario;
  run: Run;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(""),
    [include, setInclude] = useState(false),
    [authorize, setAuthorize] = useState(false),
    [pending, setPending] = useState<{
      action: string;
      document: unknown;
      result: Result;
      signature: string;
    }>();
  const parse = () => {
    if (new Blob([text]).size > 8 * 1024 * 1024)
      throw new Error("Input exceeds 8 MiB");
    return JSON.parse(text);
  };
  const preview = async () => {
    try {
      const d = parse();
      let action = "change-set",
        document = d;
      if (d.format === "rostercore.scenario") {
        action = "import-scenario";
        document = {
          candidate: d,
          expectedRevision: s.revision,
          mode: d.id === s.id ? "REPLACE_CURRENT" : "NEW_SCENARIO",
          allowHardRuleChanges: authorize,
        };
      } else if (d.format === "rostercore.scenario-change-set") {
        document = {
          ...d,
          allowHardRuleChanges: authorize && d.allowHardRuleChanges === true,
        };
      } else
        throw new Error(
          "Choose a complete scenario or a typed scenario-change-set. Use the calendar library for archives and backups.",
        );
      const result = await run(action, { document, apply: false });
      if (result?.status === "PREVIEW")
        setPending({ action, document, result, signature: JSON.stringify(s) });
    } catch (e) {
      notifyError((e as Error).message);
    }
  };
  const resources = async () => {
    try {
      const context = await coreAction("context", s, {}, { silent: true });
      if (context.status !== "CONTEXT"){notifyResult(context,"context");return;}
      const response = await fetch("/api/ai-resources");
      if (!response.ok) throw new Error("Cannot load AI authoring resources");
      const resources = await response.json();
      download(`${s.id}.ai-package.json`, {
        format: "rostercore.ai-package",
        schemaVersion: 1,
        engineVersion: resources.engineVersion,
        createdAt: new Date().toISOString(),
        instructions:
          "Return either a complete rostercore.scenario (new distinct scenario ID) or a typed rostercore.scenario-change-set using the exact scenarioId and expectedRevision. Do not execute or invent operators. Use explicit referenceDate and effective dates. Preserve unspecified employee fields and protected history. Do not publish or confirm work. Changes are validated and explicitly confirmed locally.",
        ...resources,
        context: context.context,
        ...(include ? { scenario: s } : {}),
        personalDataIncluded: include,
        privacy:
          "Default context omits employee display names, leave records, actual assignments and unused attributes. Review custom labels and business information before sharing.",
      });
    } catch (e) {
      notifyError((e as Error).message);
    }
  };
  const after = (pending?.result.preview as { scenario?: Scenario } | undefined)
    ?.scenario as Scenario | undefined;
  const collections = [
    "employeeTypes",
    "attributeDefinitions",
    "groups",
    "constraints",
    "constraintSets",
    "employees",
    "shifts",
    "workPatterns",
    "workPatternAssignmentRules",
    "weekProfiles",
    "dutyRequirements",
    "allowedShifts",
    "policies",
    "temporalRules",
    "spacingRules",
    "availability",
  ] as const;
  return (
    <section className="panel ai-configuration">
      <h2>{t("Create or update configuration with AI")}</h2>
      <p>
        {t(
          "AI is optional. Export the supported model and guides, ask your own assistant for a JSON document, then review its changes here. Nothing is applied automatically.",
        )}
      </p>
      <div className="row">
        <button disabled={busy} onClick={resources}>
          {t("Prepare configuration for AI")}
        </button>
        <label>
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => setInclude(e.target.checked)}
          />
          {t("Include the full current scenario and personal data")}
        </label>
      </div>
      <p className="hint">
        {t(
          "The default package omits employee names, leave records, actual assignments and unused attributes. Review custom labels before sharing.",
        )}
      </p>
      <label className="field">
        <span>{t("Complete scenario or scenario change-set JSON")}</span>
        <textarea
          rows={7}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPending(undefined);
          }}
        />
      </label>
      <label className="button">
        {t("Choose a configuration file")}
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) {
              notifyError("Input exceeds 8 MiB");
              return;
            }
            setText(await f.text());
            setPending(undefined);
            e.target.value = "";
          }}
        />
      </label>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={authorize}
            onChange={(e) => {
              setAuthorize(e.target.checked);
              setPending(undefined);
            }}
          />
          {t(
            "Explicitly authorize changes to calendar, definitions and hard rules",
          )}
        </label>
        <button disabled={busy || !text.trim()} onClick={preview}>
          {t("Validate and preview configuration")}
        </button>
      </div>
      {pending && (
        <ReviewDialog
          title={t("Review configuration changes")}
          onCancel={() => setPending(undefined)}
          disabled={busy || pending.signature !== JSON.stringify(s)}
          onConfirm={async () => {
            const r = await run(pending.action, {
              document: pending.document,
              apply: true,
            });
            if (r?.status === "IMPORTED") setPending(undefined);
          }}
        >
          <p>
            {t(
              "Review these differences before applying. Confirmed actual history and official assignments are protected; a conflicting published period requires a revision proposal first.",
            )}
          </p>
          {(pending.result.preview as { historyRebuildRequired?: boolean })
            ?.historyRebuildRequired && (
            <p className="warning">
              {t(
                "These fairness changes require an explicit historical snapshot rebuild from original dated context before generation. Actual assignments remain preserved.",
              )}
            </p>
          )}
          {after && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Configuration")}</th>
                    <th>{t("Before")}</th>
                    <th>{t("After")}</th>
                  </tr>
                </thead>
                <tbody>
                  {collections
                    .filter(
                      (k) => JSON.stringify(s[k]) !== JSON.stringify(after[k]),
                    )
                    .map((k) => (
                      <tr key={k}>
                        <td>{t(k)}</td>
                        <td>{s[k]?.length ?? 0}</td>
                        <td>{after[k]?.length ?? 0}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {after &&
            collections.flatMap((k) =>
              (s[k] ?? [])
                .filter(
                  (entity) =>
                    !(after[k] as { id: string }[] | undefined)?.some(
                      (x) => x.id === entity.id,
                    ),
                )
                .map((entity) => (
                  <p className="warning" key={"removed:" + k + entity.id}>
                    {t("Removed")}: {t(k)} ·{" "}
                    {"label" in entity ? String(entity.label) : entity.id}
                  </p>
                )),
            )}
          {after &&
            (
              [
                "calendar",
                "weekConfiguration",
                "search",
                "baseConstraintIds",
                "dutyBindingMode",
              ] as const
            )
              .filter((k) => JSON.stringify(s[k]) !== JSON.stringify(after[k]))
              .map((k) => (
                <details key={k}>
                  <summary>{t(k)}</summary>
                  <div className="change-diff">
                    <pre>{JSON.stringify(s[k], null, 2)}</pre>
                    <pre>{JSON.stringify(after[k], null, 2)}</pre>
                  </div>
                </details>
              ))}
          {after &&
            collections.flatMap((k) =>
              (after[k] ?? [])
                .filter(
                  (entity) =>
                    JSON.stringify(
                      (s[k] as { id: string }[] | undefined)?.find(
                        (x) => x.id === entity.id,
                      ),
                    ) !== JSON.stringify(entity),
                )
                .map((entity) => (
                  <details key={k + entity.id}>
                    <summary>
                      {t(k)}:{" "}
                      {"label" in entity ? String(entity.label) : entity.id}
                    </summary>
                    <div className="change-diff">
                      <pre>
                        {JSON.stringify(
                          (s[k] as { id: string }[] | undefined)?.find(
                            (x) => x.id === entity.id,
                          ) ?? null,
                          null,
                          2,
                        )}
                      </pre>
                      <pre>{JSON.stringify(entity, null, 2)}</pre>
                    </div>
                  </details>
                )),
            )}
          <p>
            {t(
              "After applying, regenerate the affected future dates. Existing calendars remain saved in the library.",
            )}
          </p>
          <details className="advanced-only">
            <summary>{t("Technical preview")}</summary>
            <pre>
              {JSON.stringify(
                {
                  ...(pending.result.preview as Record<string, unknown>),
                  scenario: undefined,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </ReviewDialog>
      )}
    </section>
  );
}
