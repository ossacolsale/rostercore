import { SimplePanel } from "./simple";
import { ScheduleLibrary, type ScheduleArchive } from "./archives";
import { coreAction } from "./api";
import { PatternAssignmentRules, ReviewDialog } from "./pattern-assignments";
import {
  dependentReferences,
  editorForPath,
  referenceLabel,
  type Catalogue,
} from "./configuration";
import { ConfigurationGuide } from "./configuration-guide";
import { notifyError, notifyResult, notifyMessage } from "./notifications";
import { CatalogueContext, type CatalogueKind } from "./catalogue-context";
import { initializeEvolution } from "./evolution-model";
import {
  Workforce,
  WorkPatterns,
  Variants,
  RegenerationControl,
  CatalogueUsage,
  UpgradeNotice,
} from "./evolution";
import {
  WeekPlanner,
  HolidayClosures,
  CoverageRules,
} from "./planning-editors";
import { LanguageSelector, useI18n } from "./i18n";
import { useEffect, useState, useRef } from "react";
import {
  type Scenario,
  type Result,
  download,
  newPolicy,
  newConstraint,
  id,
  planningSignature,
} from "./model";
import { People, Shifts, Calendar, type Update } from "./setup";
import { Policies } from "./policies";
import { Imports } from "./imports";
import { Results } from "./results";
import { Text, Select, EntityHeader } from "./editors";
const tabs = [
  ["overview", "01", "Overview"],
  ["people", "02", "People & groups"],
  ["shifts", "03", "Shift types"],
  ["contracts", "04", "Contracts & work patterns"],
  ["variants", "05", "Shift time variants"],
  ["weeks", "06", "Week profiles & recurrence"],
  ["calendar", "07", "Calendar & availability"],
  ["coverage", "08", "Coverage & temporal rules"],
  ["policies", "09", "Planning policies"],
  ["imports", "10", "AI & HR imports"],
  ["results", "11", "Schedule & fairness"],
  ["archives", "▣", "Saved calendars"],
  ["advanced", "{ }", "Advanced JSON"],
];
type Solved = {
  scenario: Scenario;
  result: Result;
  archiveId?: string;
  scenarioEncoding?: string;
};
const STORAGE = "rostercore.scenario.v1";
export default function App() {
  const { t, diagnostic, localizeError } = useI18n();
  const [mode, setMode] = useState(
    () => localStorage.getItem("rostercore.mode.v1") ?? "SIMPLE",
  );
  const changeMode = (v: string) => {
    setMode(v);
    localStorage.setItem("rostercore.mode.v1", v);
  };
  const archiveStorageBroken = useRef(false);
  const [archives, setArchives] = useState<ScheduleArchive[]>(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem("rostercore.archives.v1") ?? "[]",
      );
      if (
        !Array.isArray(data) ||
        data.some((a) => a?.format !== "rostercore.schedule-archive")
      )
        throw new Error("Invalid library");
      return data;
    } catch {
      archiveStorageBroken.current = true;
      return [];
    }
  });
  const [fullImportReview, setFullImportReview] = useState<{
    document: Record<string, unknown>;
    candidate: Scenario;
  }>();
  const [allowFullReplacement, setAllowFullReplacement] = useState(false);
  const [libraryReview, setLibraryReview] = useState<Record<string, unknown>>();
  const [libraryPreview, setLibraryPreview] =
      useState<Record<string, unknown>>(),
    [libraryActual, setLibraryActual] = useState(false);
  useEffect(() => {
    if (archiveStorageBroken.current) {
      notifyError(
        "Saved calendar storage is unreadable. Its original contents have been preserved; export browser recovery data before repairing browser storage.",
      );
      return;
    }
    try {
      localStorage.setItem("rostercore.archives.v1", JSON.stringify(archives));
    } catch {
      notifyError(
        "Browser storage is full or disabled. Export your scenario before closing.",
      );
    }
  }, [archives]);
  const [s, setS] = useState<Scenario>(),
    [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [fatal, setFatalState] = useState(""),
    [solved, setSolved] = useState<Solved>(),
    [previous, setPrevious] = useState<Result>(),
    [raw, setRaw] = useState("");
  const setFatal = (text: string) => {
    setFatalState(text);
    if (text) notifyError(text);
  };
  const setMessage = (result: Result | undefined, operation?: string) => {
    if (result) notifyResult(result, operation);
  };
  useEffect(() => {
    const handler = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key === "advanced") setRaw(JSON.stringify(s, null, 2));
      setTab(key);
    };
    window.addEventListener("rostercore:editor", handler);
    return () => window.removeEventListener("rostercore:editor", handler);
  }, [s]);
  const [deletion, setDeletion] = useState<{
    next: Scenario;
    labels: string[];
    dependencies: { path: string }[];
  }>();
  const previousConfiguration = useRef<Scenario | undefined>(undefined);
  const lastBlur = useRef("");
  useEffect(() => {
    if (!s) return;
    const previous = previousConfiguration.current;
    previousConfiguration.current = s;
    if (
      previous &&
      [
        "employees",
        "employeeTypes",
        "attributeDefinitions",
        "groups",
        "workPatterns",
        "workPatternAssignmentRules",
        "shifts",
        "weekProfiles",
        "policies",
      ].some(
        (key) =>
          (s[key as keyof Scenario] as unknown[] | undefined)?.length !==
          (previous[key as keyof Scenario] as unknown[] | undefined)?.length,
      )
    )
      notifyMessage("Configuration items updated");
  }, [s]);
  const [validationContext, setValidationContext] = useState<{
    hash: string;
    paths: string[];
  }>();
  const undoStack = useRef<Scenario[]>([]);
  const [, setUndoVersion] = useState(0);
  const [createKind, setCreateKind] = useState<CatalogueKind | null>(null),
    [newLabel, setNewLabel] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const saved = localStorage.getItem(STORAGE);
        if (saved) {
          const candidate = JSON.parse(saved);
          if (
            candidate.format === "rostercore.scenario" &&
            Array.isArray(candidate.baseConstraintIds)
          ) {
            const response = await fetch("/api/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "validate", scenario: candidate }),
            });
            const check = await response.json();
            if (active) {
              setS(candidate);
              if (check.status !== "VALID") notifyResult(check);
            }
            return;
          }
        }
        const r = await fetch(
          mode === "SIMPLE" ? "/api/example-simple" : "/api/example",
        );
        if (!r.ok) throw new Error("Cannot load example");
        const j = await r.json();
        if (active) setS(j);
      } catch (e) {
        if (active) setFatal((e as Error).message);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (s)
      try {
        localStorage.setItem(STORAGE, JSON.stringify(s));
      } catch {
        setFatal(
          "Browser storage is full or disabled. Export your scenario before closing.",
        );
      }
  }, [s]);
  const commitEdit = (next: Scenario) => {
    if (s) {
      undoStack.current.push(s);
      if (undoStack.current.length > 20) undoStack.current.shift();
    }
    if (s && JSON.stringify(s) !== JSON.stringify(next))
      next.revision = s.revision + 1;
    setS(next);
  };
  const update: Update = (fn) => {
    if (!s) return;
    const next = structuredClone(s);
    fn(next);
    const removed: { catalogue: Catalogue; id: string; label: string }[] = [];
    for (const catalogue of [
      "employeeTypes",
      "employees",
      "attributeDefinitions",
      "groups",
      "workPatterns",
      "shifts",
      "weekProfiles",
      "constraints",
      "policies",
    ] as Catalogue[]) {
      const before = s[catalogue] ?? [],
        after = next[catalogue] ?? [];
      if (after.length < before.length)
        for (const item of before)
          if (!after.some((x) => x.id === item.id))
            removed.push({
              catalogue,
              id: item.id,
              label: item.label ?? item.id,
            });
    }
    if (removed.length) {
      setDeletion({
        next,
        labels: removed.map((x) => x.label),
        dependencies: removed.flatMap((x) =>
          dependentReferences(next, x.catalogue, x.id),
        ),
      });
      return;
    }
    commitEdit(next);
  };
  const run = async (
    command: string,
    extra: Record<string, unknown> = {},
  ): Promise<Result | undefined> => {
    if (!s || busy) return;
    setBusy(true);
    setAction(command);
    setFatal("");
    const snapshot = structuredClone(
      (extra.scenario as Scenario | undefined) ?? s,
    );
    if ((command === "verify" || command === "verify-quality") && solved) {
      extra = {
        ...extra,
        scenario: solved.scenario,
        ...(solved.scenarioEncoding
          ? { scenarioEncoding: solved.scenarioEncoding }
          : {}),
      };
    }
    if (command === "improve" && solved?.scenarioEncoding)
      extra = {
        ...extra,
        document: {
          ...(extra.document as Record<string, unknown>),
          previousScenarioEncoding: solved.scenarioEncoding,
        },
      };
    try {
      if (
        command === "consolidate" &&
        String(extra.through) > new Date().toISOString().slice(0, 10)
      )
        throw new Error(
          "Future work cannot be confirmed as completed. Choose a date on or before today.",
        );
      if (command === "consolidate" && solved?.archiveId) {
        command = "archives";
        extra = {
          document: {
            operation: "COMPLETE",
            id: solved.archiveId,
            through: extra.through,
            archives,
            expectedRevision: snapshot.revision,
            dryRun: true,
            at: new Date().toISOString(),
          },
          inlineReview: true,
        };
      }
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: command, scenario: snapshot, ...extra }),
      });
      const r = await response.json();
      if (!response.ok || r.error) throw new Error(r.error || "Request failed");
      setMessage(r, command);
      if (command === "validate")
        setValidationContext({
          hash: JSON.stringify(extra.scenario ?? snapshot),
          paths: r.diagnostics
            .filter(
              (d: { severity?: string }) => (d.severity ?? "ERROR") === "ERROR",
            )
            .map((d: { path: string }) => d.path),
        });
      if (
        command === "solve" ||
        command === "regenerate" ||
        command === "improve"
      ) {
        if (solved?.result.assignments) setPrevious(solved.result);
        const context = r.scenario ?? snapshot;
        let archiveId: string | undefined;
        if (r.assignments && ["OPTIMAL", "FEASIBLE"].includes(r.status)) {
          const saved = await coreAction(
            "archives",
            context,
            {
              document: {
                operation: "CREATE",
                id: id("schedule"),
                result: r,
                createdAt: new Date().toISOString(),
                source: "local-playground",
                archives,
                expectedRevision: context.revision,
                dryRun: false,
              },
            },
            { silent: true },
          ).catch((error) => {
            notifyError((error as Error).message);
            return undefined;
          });
          if (saved?.archives && saved.archive) {
            setArchives(saved.archives);
            archiveId = saved.archive.id;
          } else if (saved) notifyResult(saved, "archives");
        }
        setSolved({ scenario: context, result: r, archiveId });
        setTab(current=>current===tab?"results":current);
      }
      if (r.archives) setArchives(r.archives);
      if (r.restoredSchedule) {
        if (solved?.result.assignments) setPrevious(solved.result);
        setSolved(r.restoredSchedule);
        setTab("results");
      }
      if (
        command === "archives" &&
        r.status === "PREVIEW" &&
        extra.inlineReview
      ) {
        setLibraryReview(extra.document as Record<string, unknown>);
        setLibraryPreview(r.preview);
        setLibraryActual(false);
      }
      if (command === "import-scenario" && r.scenario) {
        setSolved(undefined);
        setTab("overview");
      }
      if (r.scenario) {
        undoStack.current = [];
        setUndoVersion((v) => v + 1);
        setS(r.scenario);
        if (
          command === "archives" &&
          ["RESTORE"].includes(
            (extra.document as { operation?: string })?.operation ?? "",
          )
        )
          setSolved(undefined);
        if (command === "consolidate") {
          undoStack.current = [];
          setTab("overview");
        }
      }
      return r;
    } catch (e) {
      setFatal((e as Error).message);
    } finally {
      setBusy(false);
      setAction("");
    }
  };
  const choose = (key: string) => {
    if (key === "advanced") setRaw(JSON.stringify(s, null, 2));
    setTab(key);
  };
  const loadExample = async (kind = "legacy") => {
    if (busy) return;
    setBusy(true);
    setAction("load-example");
    try {
      const res = await fetch(
        kind === "patterns"
          ? "/api/example-patterns"
          : kind === "evolution"
            ? "/api/example-evolution"
            : kind === "automatic"
              ? "/api/example-automatic"
              : "/api/example",
      );
      if (!res.ok) throw new Error("Cannot load example");
      setS(await res.json());
      notifyMessage("Example loaded");
      setSolved(undefined);
      setMessage(undefined);
      setTab("overview");
    } catch (e) {
      setFatal((e as Error).message);
    } finally {
      setBusy(false);
      setAction("");
    }
  };
  const importScenario = async (text: string) => {
    if (!s) return;
    try {
      const candidate = JSON.parse(text);
      const document = {
        candidate,
        expectedRevision: s.revision,
        mode: candidate.id === s.id ? "REPLACE_CURRENT" : "NEW_SCENARIO",
        allowHardRuleChanges: true,
      };
      const result = await run("import-scenario", { document, apply: false });
      if (result?.status === "PREVIEW") {
        setAllowFullReplacement(false);
        setFullImportReview({ document, candidate });
      }
    } catch (e) {
      setFatal((e as Error).message);
    }
  };
  if (!s)
    return (
      <main className="loading">
        <div className="logo-mark">R</div>
        <h1>RosterCore</h1>
        <LanguageSelector />
        <p>
          {fatal ? localizeError(fatal) : t("Loading your local workspace…")}
        </p>
      </main>
    );
  const stale =
    !!solved &&
    planningSignature(s, solved.result) !==
      planningSignature(solved.scenario, solved.result);
  const blank = () => {
    const next = structuredClone(s);
    next.id = id("scenario");
    next.label = t("Untitled workforce scenario");
    next.revision = 1;
    next.employeeTypes = [];
    next.employees = [];
    next.groups = [];
    next.shifts = [];
    next.availability = [];
    next.allowedShifts = [];
    next.constraints = [];
    next.baseConstraintIds = [];
    next.constraintSets = [];
    next.policies = [];
    next.history = { assignments: [], fairnessSnapshots: [] };
    next.publishedAssignments = [];
    next.hrState = { events: [], snapshotRevisions: {} };
    for (const key of [
      "attributeDefinitions",
      "workPatterns",
      "workPatternAssignmentRules",
      "weekProfiles",
      "dutyRequirements",
      "temporalRules",
    ] as const)
      next[key] = [];
    next.schemaVersion = 3;
    next.weekConfiguration = {
      manual: [],
      recurrences: [],
      frequencies: [],
      history: [],
    };
    delete next.replanning;
    delete next.calendar.holidays;
    next.calendar.closures = [];
    initializeEvolution(next);
    undoStack.current = [];
    setS(next);
    setSolved(undefined);
    setMessage(undefined);
    setTab("people");
  };
  const simple = () =>
    update((d) => {
      const p = newPolicy(d, t);
      const target = d.shifts.find((sh) => sh.kind === "WORKING");
      if (!target) return;
      p.objective.shiftIds = [target.id];
      const c = newConstraint(d, t);
      c.label = t("One daily duty");
      c.expression = {
        op: "COUNT",
        selector: {},
        shiftId: target.id,
        comparison: "EQ",
        count: 1,
      };
      p.constraints = [c];
      d.policies.push(p);
    });
  return (
    <CatalogueContext.Provider
      value={(kind) => {
        setCreateKind(kind);
        setNewLabel("");
      }}
    >
      <div
        className={"app mode-" + mode.toLowerCase()}
        onFocusCapture={() => {
          lastBlur.current = JSON.stringify(s);
        }}
        onBlurCapture={() => {
          if (lastBlur.current && lastBlur.current !== JSON.stringify(s)) {
            notifyMessage("Configuration updated");
            lastBlur.current = JSON.stringify(s);
          }
        }}
      >
        {fullImportReview && (
          <ReviewDialog
            title={t("Review complete scenario import")}
            onCancel={() => setFullImportReview(undefined)}
            disabled={
              busy ||
              (fullImportReview.candidate.id === s.id && !allowFullReplacement)
            }
            onConfirm={async () => {
              const result = await run("import-scenario", {
                document: fullImportReview.document,
                apply: true,
              });
              if (result?.status === "IMPORTED") setFullImportReview(undefined);
            }}
          >
            <p>
              {t(
                "The native preview validated references and protected history. Applying replaces the current configuration; saved calendar archives remain available.",
              )}
            </p>
            <p>
              {s.label} → {fullImportReview.candidate.label}
            </p>
            <p>
              {t("Employees")}: {s.employees.length} →{" "}
              {fullImportReview.candidate.employees.length}
            </p>
            {fullImportReview.candidate.id === s.id && (
              <label>
                <input
                  type="checkbox"
                  checked={allowFullReplacement}
                  onChange={(e) => setAllowFullReplacement(e.target.checked)}
                />
                {t(
                  "Explicitly authorize changes to calendar, definitions and hard rules",
                )}
              </label>
            )}
          </ReviewDialog>
        )}
        {libraryReview && (
          <ReviewDialog
            title={t("Confirm calendar operation")}
            disabled={
              busy || (libraryReview.operation === "COMPLETE" && !libraryActual)
            }
            onCancel={() => setLibraryReview(undefined)}
            onConfirm={async () => {
              const r = await run("archives", {
                document: { ...libraryReview, dryRun: false },
              });
              if (r && r.status !== "VALIDATION_ERROR")
                setLibraryReview(undefined);
            }}
          >
            <p>
              {t("Revision")}: {String(libraryPreview?.beforeRevision)} →{" "}
              {String(libraryPreview?.afterRevision)}
            </p>
            <p>
              {t("History assignments")}:{" "}
              {String(libraryPreview?.historyAssignmentsBefore)} →{" "}
              {String(libraryPreview?.historyAssignmentsAfter)}
            </p>
            <p>
              {t("Protected future assignments")}:{" "}
              {String(libraryPreview?.publishedLocksBefore)} →{" "}
              {String(libraryPreview?.publishedLocksAfter)}
            </p>
            {libraryReview.operation === "COMPLETE" && (
              <>
                <p>
                  {t("Actually worked through")}:{" "}
                  {String(libraryReview.through)}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={libraryActual}
                    onChange={(e) => setLibraryActual(e.target.checked)}
                  />
                  {t("I confirm these shifts were actually worked")}
                </label>
              </>
            )}
            <p>
              {t(
                "Publishing protects future work. Confirming completion adds only the explicitly selected actual-work prefix to history.",
              )}
            </p>
          </ReviewDialog>
        )}
        {deletion && (
          <ReviewDialog
            title={t("Review catalogue deletion")}
            onCancel={() => setDeletion(undefined)}
            disabled={!!deletion.dependencies.length}
            onConfirm={() => {
              commitEdit(deletion.next);
              setDeletion(undefined);
              notifyMessage("Catalogue item removed");
            }}
          >
            <p>{deletion.labels.join(", ")}</p>
            {deletion.dependencies.length ? (
              <>
                <p className="error">
                  {t(
                    "This item is still used. Update its dependants before deleting it.",
                  )}
                </p>
                <ul>
                  {deletion.dependencies.map((ref, i) => (
                    <li key={i}>
                      <button
                        onClick={() => {
                          setDeletion(undefined);
                          choose(editorForPath(ref.path));
                        }}
                      >
                        {referenceLabel(s, ref.path)}
                      </button>{" "}
                      <code>{ref.path}</code>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                {t(
                  "No remaining explicit references. Confirm removal of these items.",
                )}
              </p>
            )}
          </ReviewDialog>
        )}
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              choose("overview");
            }}
          >
            <span className="logo-mark">R</span>
            <span>
              RosterCore<small>{t("PLANNING PLAYGROUND")}</small>
            </span>
          </a>
          <div className="workspace-label">
            {t("LOCAL WORKSPACE")} <span className="live-dot" />
          </div>
          <nav aria-label={t("Main navigation")}>
            {(mode === "ADVANCED" ? tabs : []).map(([key, num, label]) => (
              <button
                key={key}
                data-testid={"nav-" + key}
                className={tab === key ? "active" : ""}
                onClick={() => choose(key)}
              >
                <span>{num}</span>
                {t(label)}
                {key === "results" && solved?.result.assignments && <i />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="version">v0.5.0 · CP-SAT</span>
            <p>
              {t("Continuous fairness.")} <br />
              {t("One shared model.")}{" "}
            </p>
            <span className="privacy-dot">●</span>{" "}
            {t("Runs on your computer")}{" "}
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              {t("Workspace")} <span>/</span>{" "}
              {t(tabs.find((tabInfo) => tabInfo[0] === tab)?.[2] || "Overview")}
            </div>
            <div className="top-actions">
              <LanguageSelector />
              <select
                aria-label={t("Interface mode")}
                value={mode}
                onChange={(e) =>
                  changeMode(e.target.value as "SIMPLE" | "ADVANCED")
                }
              >
                <option value="SIMPLE">{t("Simple mode")}</option>
                <option value="ADVANCED">{t("Advanced mode")}</option>
              </select>
              {mode === "ADVANCED" && (
                <>
                  <button
                    disabled={busy || !undoStack.current.length}
                    onClick={() => {
                      const previous = undoStack.current.pop();
                      if (previous) setS(previous);
                      setUndoVersion((v) => v + 1);
                    }}
                  >
                    {t("Undo change")}
                  </button>
                  <button disabled={busy} onClick={() => run("validate")}>
                    {t("Validate scenario")}{" "}
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => run("solve")}
                  >
                    {busy
                      ? action === "solve"
                        ? `${t("Solving")}…`
                        : t("Working…")
                      : t("Generate schedule")}{" "}
                    <span>↗</span>
                  </button>
                </>
              )}
            </div>
          </header>
          <main>
            <div className={mode === "SIMPLE" ? "hidden" : "page-eyebrow"}>
              {t("WORKFORCE OPTIMIZATION")} <span>●</span>{" "}
              {t("LOCAL & PRIVATE")}{" "}
            </div>
            <fieldset
              className={"scenario-content " + (busy ? "busy-content" : "")}
              disabled={busy}
              aria-busy={busy}
            >
              {mode === "SIMPLE" && (
                <SimplePanel
                  s={s}
                  validated={
                    validationContext?.hash === JSON.stringify(s) &&
                    !validationContext.paths.length
                  }
                  update={update}
                  replace={(next) => {
                    commitEdit(next);
                    if (next.id !== s.id) setSolved(undefined);
                  }}
                  solved={solved}
                  previous={previous}
                  stale={stale}
                  busy={busy}
                  run={run}
                  archives={archives}
                  compare={setPrevious}
                  publish={() => {
                    if (!solved?.archiveId) {
                      notifyError(
                        "Save a verified draft archive before publishing.",
                      );
                      return;
                    }
                    run("archives", {
                      document: {
                        operation: "PUBLISH",
                        id: solved.archiveId,
                        archives,
                        expectedRevision: s.revision,
                        dryRun: true,
                        at: new Date().toISOString(),
                      },
                      inlineReview: true,
                    });
                  }}
                />
              )}
              {mode === "ADVANCED" && (
                <div className="advanced-surface">
                  <ConfigurationGuide
                    s={s}
                    tab={tab}
                    onNavigate={choose}
                    errorPaths={
                      validationContext?.hash === JSON.stringify(s)
                        ? validationContext.paths
                        : []
                    }
                    result={solved?.result}
                    stale={stale}
                  />
                  <UpgradeNotice s={s} onUpgrade={() => run("migrate")} />
                  {solved?.result.assignments &&
                    ["overview", "results", "calendar", "imports"].includes(
                      tab,
                    ) && (
                      <RegenerationControl
                        s={s}
                        previousScenario={solved.scenario}
                        previousResult={solved.result}
                        run={run}
                      />
                    )}
                  {tab === "overview" && (
                    <CatalogueUsage s={s} onNavigate={choose} />
                  )}
                  {tab === "overview" && (
                    <>
                      <div className="hero">
                        <div>
                          <span className="pill">
                            {t("DECLARATIVE PLANNING ENGINE")}
                          </span>
                          <h1>
                            {t("A fairer schedule,")} <br />
                            <em>{t("across every horizon.")}</em>
                          </h1>
                          <p>
                            {t(
                              "Define your people and rules. Generate a real schedule. Carry every fairness balance forward.",
                            )}{" "}
                          </p>
                          <div className="row">
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() => run("solve")}
                            >
                              {t("Generate schedule ↗")}{" "}
                            </button>
                            <button onClick={() => choose("policies")}>
                              {t("Configure policies")}{" "}
                            </button>
                          </div>
                        </div>
                        <div className="hero-graphic" aria-hidden="true">
                          <div className="orbit one" />
                          <div className="orbit two" />
                          <div className="orbit three" />
                          <span className="core-dot" />
                          <span className="orbit-dot a" />
                          <span className="orbit-dot b" />
                          <span className="orbit-dot c" />
                          <small>{t("IDEAL − ACTUAL = DEBT")}</small>
                        </div>
                      </div>
                      <div className="stats">
                        <div>
                          <span>{t("People")}</span>
                          <strong>
                            {s.employees.length.toString().padStart(2, "0")}
                          </strong>
                          <small>
                            {t("across {count} types", {
                              count: s.employeeTypes.length,
                            })}
                          </small>
                        </div>
                        <div>
                          <span>{t("Shift types")}</span>
                          <strong>
                            {s.shifts.length.toString().padStart(2, "0")}
                          </strong>
                          <small>{t("working & scheduled rest")}</small>
                        </div>
                        <div>
                          <span>{t("Active policies")}</span>
                          <strong>
                            {s.policies
                              .filter((p) => p.active)
                              .length.toString()
                              .padStart(2, "0")}
                          </strong>
                          <small>{t("solved jointly")}</small>
                        </div>
                        <div>
                          <span>{t("Consolidated assignments")}</span>
                          <strong>{s.history.assignments.length}</strong>
                          <small>{t("no monthly reset")}</small>
                        </div>
                      </div>
                      <section className="panel">
                        <EntityHeader title={t("Your planning scenario")}>
                          <span className="badge">
                            {t("JSON contract v{version}", {
                              version: s.schemaVersion,
                            })}
                          </span>
                        </EntityHeader>
                        <div className="row">
                          <Text
                            label={t("Scenario ID")}
                            value={s.id}
                            onChange={(v) =>
                              update((d) => {
                                d.id = v;
                              })
                            }
                          />
                          <Text
                            label={t("Scenario label")}
                            value={s.label}
                            onChange={(v) =>
                              update((d) => {
                                d.label = v;
                              })
                            }
                          />
                        </div>
                        <div className="row">
                          <Text
                            label={t("Planning start")}
                            type="date"
                            value={s.calendar.start}
                            onChange={(v) =>
                              update((d) => {
                                d.calendar.start = v;
                              })
                            }
                          />
                          <Text
                            label={t("Planning end")}
                            type="date"
                            value={s.calendar.end}
                            onChange={(v) =>
                              update((d) => {
                                d.calendar.end = v;
                              })
                            }
                          />
                          <Text
                            label={t("Timezone")}
                            value={s.calendar.timezone}
                            onChange={(v) =>
                              update((d) => {
                                d.calendar.timezone = v;
                              })
                            }
                          />
                        </div>
                      </section>
                      <div className="two-columns">
                        <section className="panel">
                          <h3>{t("Get started")}</h3>
                          <p className="hint">
                            {t(
                              "The pharmacy reference is a complete generic example: five people, one closing duty per day, and continuous fairness across a month boundary.",
                            )}{" "}
                          </p>
                          <div className="stack">
                            <button onClick={() => loadExample()}>
                              {t("Load pharmacy reference")}{" "}
                            </button>
                            <button onClick={() => loadExample("evolution")}>
                              {t("Load evolving pharmacy example")}
                            </button>
                            <button onClick={() => loadExample("automatic")}>
                              {t("Load automatic week example")}
                            </button>
                            <button onClick={() => loadExample("patterns")}>
                              {t("Load automatic work-pattern example")}
                            </button>
                            <button onClick={blank}>
                              {t("Create an empty scenario")}
                            </button>
                            <button
                              disabled={
                                !s.shifts.some((sh) => sh.kind === "WORKING")
                              }
                              onClick={simple}
                            >
                              {t("Add simple balanced-duty template")}{" "}
                            </button>
                          </div>
                        </section>
                        <section className="panel">
                          <h3>{t("Search controls")}</h3>
                          <Text
                            label={t("Global solve time budget (seconds)")}
                            type="number"
                            value={s.search.maxTimeSeconds}
                            onChange={(v) =>
                              update((d) => {
                                d.search.maxTimeSeconds = Number(v);
                              })
                            }
                          />
                          <div className="row">
                            <Text
                              label={t("Random seed")}
                              type="number"
                              value={s.search.seed}
                              onChange={(v) =>
                                update((d) => {
                                  d.search.seed = Number(v);
                                })
                              }
                            />
                            <Text
                              label={t("Workers")}
                              type="number"
                              value={s.search.workers}
                              onChange={(v) =>
                                update((d) => {
                                  d.search.workers = Number(v);
                                  if (Number(v) > 1)
                                    d.search.deterministic = false;
                                })
                              }
                            />
                          </div>
                          <label>
                            <input
                              type="checkbox"
                              checked={s.search.deterministic}
                              onChange={(e) =>
                                update((d) => {
                                  d.search.deterministic = e.target.checked;
                                  if (e.target.checked) d.search.workers = 1;
                                })
                              }
                            />{" "}
                            {t("Deterministic mode (one worker)")}{" "}
                          </label>
                        </section>
                      </div>
                      <section className="panel">
                        <h3>{t("Portable configuration")}</h3>
                        <div className="row">
                          <button onClick={() => download(`${s.id}.json`, s)}>
                            {t("Export scenario JSON")}{" "}
                          </button>
                          <label className="button">
                            {t("Import scenario JSON")}{" "}
                            <input
                              hidden
                              type="file"
                              accept=".json,application/json"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file)
                                  await importScenario(await file.text());
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <span className="hint">
                            {t(
                              "Changes are saved in this browser. Export to move or back up your workspace.",
                            )}{" "}
                          </span>
                        </div>
                      </section>
                    </>
                  )}
                  {tab === "contracts" && (
                    <>
                      <WorkPatterns s={s} update={update} />
                      <PatternAssignmentRules s={s} update={update} />
                    </>
                  )}
                  {tab === "variants" && <Variants s={s} update={update} />}
                  {tab === "weeks" && <WeekPlanner s={s} update={update} />}
                  {tab === "coverage" && (
                    <CoverageRules s={s} update={update} />
                  )}
                  {tab === "people" && (
                    <>
                      <People s={s} update={update} />
                      <Workforce s={s} update={update} />
                    </>
                  )}
                  {tab === "shifts" && (
                    <>
                      <Shifts s={s} update={update} />
                    </>
                  )}
                  {tab === "calendar" && (
                    <>
                      <Calendar s={s} update={update} />
                      <HolidayClosures s={s} update={update} />
                    </>
                  )}
                  {tab === "policies" && <Policies s={s} update={update} />}
                  {tab === "imports" && <Imports s={s} run={run} busy={busy} />}
                  {tab === "results" &&
                    (solved ? (
                      <Results
                        s={solved.scenario}
                        r={solved.result}
                        currentScenario={s}
                        archives={archives}
                        archive={archives.find(
                          (a) => a.id === solved.archiveId,
                        )}
                        busy={busy}
                        previous={previous}
                        stale={stale}
                        run={run}
                        publish={() => {
                          if (!solved.archiveId) {
                            notifyError(
                              "Save a verified draft archive before publishing.",
                            );
                            return;
                          }
                          run("archives", {
                            document: {
                              operation: "PUBLISH",
                              id: solved.archiveId,
                              archives,
                              expectedRevision: s.revision,
                              dryRun: true,
                              at: new Date().toISOString(),
                            },
                            inlineReview: true,
                          });
                        }}
                      />
                    ) : (
                      <section className="empty-state">
                        <div className="empty-glyph">▦</div>
                        <h2>{t("Your next schedule starts here")}</h2>
                        <p>
                          {t(
                            "Generate a schedule to inspect assignments, coverage, and cumulative fairness.",
                          )}{" "}
                        </p>
                        <button
                          className="primary"
                          onClick={() => run("solve")}
                        >
                          {t("Generate schedule")}{" "}
                        </button>
                      </section>
                    ))}
                  {(tab === "archives" || tab === "results") && (
                    <ScheduleLibrary
                      s={s}
                      archives={archives}
                      activeId={solved?.archiveId}
                      run={run}
                      comparisonScenarioId={solved?.scenario.id}
                      onCompare={(result) => {
                        setPrevious(result);
                        setTab("results");
                      }}
                    />
                  )}
                  {tab === "advanced" && (
                    <>
                      <EntityHeader title={t("Advanced JSON")} />
                      <p className="intro">
                        {t(
                          "This is the same document used by the visual editors and CLI. Apply only after core validation.",
                        )}{" "}
                      </p>
                      <section className="panel">
                        <label className="field">
                          <span>{t("Scenario JSON")}</span>
                          <textarea
                            className="json-editor full"
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                          />
                        </label>
                        <div className="row">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => importScenario(raw)}
                          >
                            {t("Validate & apply JSON")}{" "}
                          </button>
                          <button
                            onClick={() => setRaw(JSON.stringify(s, null, 2))}
                          >
                            {t("Reset editor from current scenario")}{" "}
                          </button>
                          <button onClick={() => download(`${s.id}.json`, s)}>
                            {t("Export current scenario")}{" "}
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}
            </fieldset>
            <footer>
              RosterCore <span>{t("Open-source scheduling · Apache-2.0")}</span>
              <span>
                {t(
                  mode === "SIMPLE"
                    ? "Runs on your computer"
                    : "Local civil time · Exact rational fairness",
                )}
              </span>
            </footer>
          </main>
        </div>
        {createKind && (
          <div className="dialog-backdrop">
            <section
              className="panel catalogue-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={t("Create catalogue item")}
            >
              <h2>{t("Create catalogue item")}</h2>
              <Text
                label={t("Display label")}
                value={newLabel}
                onChange={setNewLabel}
              />
              <div className="row">
                <button onClick={() => setCreateKind(null)}>
                  {t("Cancel")}
                </button>
                <button
                  className="primary"
                  disabled={!newLabel.trim()}
                  onClick={() => {
                    update((d) => {
                      initializeEvolution(d);
                      switch (createKind) {
                        case "attribute":
                          d.attributeDefinitions!.push({
                            id: id("attribute"),
                            label: newLabel,
                            type: "STRING",
                            visible: true,
                          });
                          break;
                        case "pattern":
                          d.workPatterns!.push({
                            id: id("pattern"),
                            label: newLabel,
                            versions: [
                              {
                                validFrom: d.calendar.start,
                                weekdays: [1, 2, 3, 4, 5],
                                shiftIds: d.shifts.map((x) => x.id),
                                exceptions: [],
                              },
                            ],
                          });
                          break;
                        case "profile": {
                          const profileId = id("profile");
                          d.weekProfiles!.push({
                            id: profileId,
                            label: newLabel,
                            offWeekdays: [],
                            holidayMode: "NORMAL",
                            constraintIds: [],
                            policyIds: [],
                          });
                          if (!d.weekConfiguration!.defaultProfileId)
                            d.weekConfiguration!.defaultProfileId = profileId;
                          break;
                        }
                        case "group":
                          d.groups.push({
                            id: id("group"),
                            label: newLabel,
                            selector: {},
                          });
                          break;
                        case "employeeType":
                          d.employeeTypes.push({
                            id: id("type"),
                            label: newLabel,
                          });
                          break;
                        case "shift":
                          d.shifts.push({
                            id: id("shift"),
                            label: newLabel,
                            kind: "WORKING",
                            intervals: [
                              { start: "09:00", end: "17:00", endDayOffset: 0 },
                            ],
                          });
                          break;
                      }
                    });
                    setCreateKind(null);
                  }}
                >
                  {t("Create and reuse")}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </CatalogueContext.Provider>
  );
}
