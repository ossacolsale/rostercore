import { useI18n } from "./i18n";
import { useState } from "react";
import { type Scenario, type Result, download } from "./model";
import { type Run } from "./results";
import { Select, EntityHeader } from "./editors";
export function Imports({
  s,
  run,
  busy,
}: {
  s: Scenario;
  run: Run;
  busy: boolean;
}) {
  const { t, localizeError } = useI18n();
  const [kind, setKind] = useState("import-policy"),
    [text, setText] = useState(""),
    [document, setDocument] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<Result>(),
    [mappings, setMappings] = useState<Record<string, string>>({}),
    [previewKey, setPreviewKey] = useState("");
  const parse = (value: string) => {
    setText(value);
    setPreview(undefined);
    try {
      const d = JSON.parse(value);
      setDocument(d);
      setError("");
    } catch (e) {
      setDocument(null);
      setError((e as Error).message);
    }
  };
  const dependencies =
    (
      document as unknown as {
        policy?: { dependencies?: { symbol: string; kind: string }[] };
      }
    )?.policy?.dependencies || [];
  const entities: Record<string, { id: string; label: string }[]> = {
    employee: s.employees,
    type: s.employeeTypes,
    group: s.groups,
    shift: s.shifts,
    constraint: s.constraints.map((c) => ({
      id: c.id,
      label: c.label || c.id,
    })),
    constraintSet: s.constraintSets,
  };
  const key = JSON.stringify({ scenario: s, document, mappings, kind });
  const act = async (apply: boolean) => {
    const r = await run(kind, {
      document,
      apply,
      mappings: kind === "import-policy" ? mappings : undefined,
    });
    if (r) {
      setPreview(r);
      if (!apply && r.status === "PREVIEW") setPreviewKey(key);
    }
  };
  return (
    <>
      <EntityHeader title={t("AI & HR imports")} />
      <p className="intro">
        {t(
          "Import declarative documents, inspect the changes, then apply them explicitly. Validation and revision checks run in the C++ core.",
        )}{" "}
      </p>
      <section className="panel">
        <h3>{t("AI authoring resources")}</h3>
        <p>
          {t(
            "Give an AI assistant the authoring guide and a context export. The context omits employee display names, leave records, history, and unused attributes. Review any custom labels before sharing.",
          )}{" "}
        </p>
        <div className="row">
          <a
            className="button"
            href="/api/guide"
            download="AI_POLICY_AUTHORING_GUIDE.md"
          >
            {t("Download AI guide")}{" "}
          </a>
          <button
            disabled={busy}
            onClick={async () => {
              const r = await run("context");
              if (r?.context) download("rostercore-ai-context.json", r.context);
            }}
          >
            {t("Export AI context")}{" "}
          </button>
          <button
            onClick={() =>
              download(
                "rostercore-ai-prompt.txt",
                t(
                  "Using AI_POLICY_AUTHORING_GUIDE.md and the attached context, create one rostercore.planning-policy document. Use only known IDs. Include a CUMULATIVE_FAIRNESS COUNT objective and all required hard constraints. Explain ambiguities before generating a file. My request: [describe participants, shifts, required staffing, dates and fairness participation].",
                ),
              )
            }
          >
            {t("Download prompt")}{" "}
          </button>
        </div>
      </section>
      <section className="panel">
        <h3>{t("Import a document")}</h3>
        <div className="row">
          <Select
            label={t("Document kind")}
            value={kind}
            options={[
              {
                id: "import-policy",
                label: t("Planning policy · CREATE / REPLACE"),
              },
              {
                id: "sync-hr",
                label: t("HR absence events · UPSERT / DELETE"),
              },
              {
                id: "rebuild-history",
                label: t("Rebuild fairness · dated historical contexts"),
              },
            ]}
            onChange={(v) => {
              setKind(v);
              setPreview(undefined);
            }}
          />
          <label className="button">
            {t("Choose JSON file")}{" "}
            <input
              hidden
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) parse(await file.text());
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <label className="field">
          <span>{t("Policy or HR document JSON")}</span>
          <textarea
            className="json-editor"
            value={text}
            placeholder={t("Paste a planning-policy or HR events document…")}
            onChange={(e) => parse(e.target.value)}
          />
        </label>
        {error && text && (
          <div className="error">
            <p>{localizeError(error, "JSON_PARSE")}</p>
            <details>
              <summary>{t("Original technical details")}</summary>
              <pre lang="en">{error}</pre>
            </details>
          </div>
        )}
        {dependencies.length > 0 && (
          <div className="dependency-map">
            <h4>{t("Resolve symbolic dependencies")}</h4>
            {dependencies.map((dep) => (
              <Select
                key={dep.symbol}
                label={`${dep.symbol} (${dep.kind})`}
                value={mappings[dep.symbol] || ""}
                options={[
                  { id: "", label: t("Keep unresolved draft") },
                  ...(entities[dep.kind] || []),
                ]}
                onChange={(v) => {
                  const next = { ...mappings };
                  if (v) next[dep.symbol] = v;
                  else delete next[dep.symbol];
                  setMappings(next);
                  setPreview(undefined);
                }}
              />
            ))}
            <p className="hint">
              {t(
                "Create missing entities using the scenario editors, then return here to map them. To activate a resolved draft, set draft=false and active=true in the policy document.",
              )}{" "}
            </p>
          </div>
        )}
        <div className="row">
          <button
            className="primary"
            disabled={!document || busy}
            onClick={() => act(false)}
          >
            {t("Preview & validate import")}{" "}
          </button>
          <button
            disabled={
              busy || preview?.status !== "PREVIEW" || key !== previewKey
            }
            onClick={() => act(true)}
          >
            {t("Confirm and apply import")}{" "}
          </button>
        </div>
        {preview && (
          <div className="import-preview">
            <h4>
              {preview.status === "PREVIEW"
                ? t("Changes awaiting confirmation")
                : t(preview.status)}
            </h4>
            <pre>
              {JSON.stringify(preview.preview || preview.diagnostics, null, 2)}
            </pre>
          </div>
        )}
      </section>
      <section className="panel">
        <h3>{t("HR state")}</h3>
        <p className="hint">
          {t(
            "Approved full-day events affect availability. Replays are idempotent; tombstones prevent stale updates from restoring deleted leave. Conflicts with protected work are rejected.",
          )}{" "}
        </p>
        <p>
          {t(
            "{events} stored events · {published} published assignments · {consolidated} consolidated assignments",
            {
              events: s.hrState.events.length,
              published: s.publishedAssignments.length,
              consolidated: s.history.assignments.length,
            },
          )}{" "}
        </p>
        <details>
          <summary>{t("Inspect normalized HR state")}</summary>
          <pre>{JSON.stringify(s.hrState, null, 2)}</pre>
        </details>
      </section>
    </>
  );
}
