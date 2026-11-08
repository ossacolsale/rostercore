import { useEffect, useState } from "react";
import {
  type Scenario,
  type Result,
  download,
  newPolicy,
  newConstraint,
  id,
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
  ["calendar", "04", "Calendar & availability"],
  ["policies", "05", "Planning policies"],
  ["imports", "06", "AI & HR imports"],
  ["results", "07", "Schedule & fairness"],
  ["advanced", "{ }", "Advanced JSON"],
];
type Solved = { scenario: Scenario; result: Result };
const STORAGE = "rostercore.scenario.v1";
export default function App() {
  const [s, setS] = useState<Scenario>(),
    [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [message, setMessage] = useState<Result>(),
    [fatal, setFatal] = useState(""),
    [solved, setSolved] = useState<Solved>(),
    [previous, setPrevious] = useState<Result>(),
    [raw, setRaw] = useState("");
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
            if (check.status === "VALID") {
              if (active) setS(candidate);
              return;
            }
          }
        }
        const r = await fetch("/api/example");
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
  const update: Update = (fn) =>
    setS((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      fn(next);
      return next;
    });
  const run = async (
    command: string,
    extra: Record<string, unknown> = {},
  ): Promise<Result | undefined> => {
    if (!s || busy) return;
    setBusy(true);
    setAction(command);
    setFatal("");
    const snapshot = structuredClone(s);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: command, scenario: snapshot, ...extra }),
      });
      const r = await response.json();
      if (!response.ok || r.error) throw new Error(r.error || "Request failed");
      setMessage(r);
      if (command === "solve") {
        if (solved?.result.assignments) setPrevious(solved.result);
        setSolved({ scenario: snapshot, result: r });
        setTab("results");
      }
      if (r.scenario) {
        setS(r.scenario);
        if (command === "consolidate") setTab("overview");
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
  const loadExample = async () => {
    try {
      const res = await fetch("/api/example");
      setS(await res.json());
      setSolved(undefined);
      setMessage(undefined);
      setTab("overview");
    } catch (e) {
      setFatal((e as Error).message);
    }
  };
  const importScenario = async (text: string) => {
    try {
      const candidate = JSON.parse(text);
      const r = await run("validate", { scenario: candidate });
      if (r?.status === "VALID") {
        setS(candidate);
        setSolved(undefined);
        setTab("overview");
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
        <p>{fatal || "Loading your local workspace…"}</p>
      </main>
    );
  const stale =
    !!solved && JSON.stringify(s) !== JSON.stringify(solved.scenario);
  const blank = () => {
    const next = structuredClone(s);
    next.id = id("scenario");
    next.label = "Untitled workforce scenario";
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
    setS(next);
    setSolved(undefined);
    setMessage(undefined);
    setTab("people");
  };
  const simple = () =>
    update((d) => {
      const p = newPolicy(d);
      const target = d.shifts.find((sh) => sh.kind === "WORKING");
      if (!target) return;
      p.objective.shiftIds = [target.id];
      const c = newConstraint(d);
      c.label = "One daily duty";
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
    <div className="app">
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
            RosterCore<small>PLANNING PLAYGROUND</small>
          </span>
        </a>
        <div className="workspace-label">
          LOCAL WORKSPACE <span className="live-dot" />
        </div>
        <nav aria-label="Main navigation">
          {tabs.map(([key, num, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => choose(key)}
            >
              <span>{num}</span>
              {label}
              {key === "results" && solved?.result.assignments && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="version">v0.1.0 · CP-SAT</span>
          <p>
            Continuous fairness.
            <br />
            One shared model.
          </p>
          <span className="privacy-dot">●</span> Runs on your computer
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {tabs.find((t) => t[0] === tab)?.[2]}
          </div>
          <div className="top-actions">
            <button disabled={busy} onClick={() => run("validate")}>
              Validate scenario
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => run("solve")}
            >
              {busy
                ? `${action === "solve" ? "Solving" : "Working"}…`
                : "Generate schedule"}{" "}
              <span>↗</span>
            </button>
          </div>
        </header>
        <main>
          <div className="page-eyebrow">
            WORKFORCE OPTIMIZATION <span>●</span> LOCAL & PRIVATE
          </div>
          {fatal && (
            <div role="alert" className="notice error">
              {fatal}
            </div>
          )}
          {message && (
            <div
              className={`feedback ${message.diagnostics.length ? "has-errors" : ""}`}
              role="status"
            >
              <strong>{message.status}</strong>
              {message.diagnostics.length === 0 && (
                <span>
                  {message.status === "VALID"
                    ? "Scenario passed structural and semantic validation."
                    : message.status === "VERIFIED"
                      ? "Assignments, hard constraints and fairness accounting verified."
                      : message.status === "PREVIEW"
                        ? "Import is valid. Review the preview before applying."
                        : ""}
                </span>
              )}
              {message.diagnostics.map((d, i) => (
                <div className="diagnostic" key={i}>
                  <b>{d.code}</b>
                  <code>{d.path}</code>
                  <p>{d.message}</p>
                </div>
              ))}
              <button
                className="subtle"
                aria-label="Dismiss diagnostic"
                onClick={() => setMessage(undefined)}
              >
                ×
              </button>
            </div>
          )}
          <div className={busy ? "busy-content" : ""} aria-busy={busy}>
            {tab === "overview" && (
              <>
                <div className="hero">
                  <div>
                    <span className="pill">DECLARATIVE PLANNING ENGINE</span>
                    <h1>
                      A fairer schedule,
                      <br />
                      <em>across every horizon.</em>
                    </h1>
                    <p>
                      Define your people and rules. Generate a real schedule.
                      Carry every fairness balance forward.
                    </p>
                    <div className="row">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => run("solve")}
                      >
                        Generate schedule ↗
                      </button>
                      <button onClick={() => choose("policies")}>
                        Configure policies
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
                    <small>IDEAL − ACTUAL = DEBT</small>
                  </div>
                </div>
                <div className="stats">
                  <div>
                    <span>People</span>
                    <strong>
                      {s.employees.length.toString().padStart(2, "0")}
                    </strong>
                    <small>across {s.employeeTypes.length} types</small>
                  </div>
                  <div>
                    <span>Shift types</span>
                    <strong>
                      {s.shifts.length.toString().padStart(2, "0")}
                    </strong>
                    <small>working & scheduled rest</small>
                  </div>
                  <div>
                    <span>Active policies</span>
                    <strong>
                      {s.policies
                        .filter((p) => p.active)
                        .length.toString()
                        .padStart(2, "0")}
                    </strong>
                    <small>solved jointly</small>
                  </div>
                  <div>
                    <span>Consolidated assignments</span>
                    <strong>{s.history.assignments.length}</strong>
                    <small>no monthly reset</small>
                  </div>
                </div>
                <section className="panel">
                  <EntityHeader title="Your planning scenario">
                    <span className="badge">JSON contract v1</span>
                  </EntityHeader>
                  <div className="row">
                    <Text
                      label="Scenario ID"
                      value={s.id}
                      onChange={(v) =>
                        update((d) => {
                          d.id = v;
                        })
                      }
                    />
                    <Text
                      label="Scenario label"
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
                      label="Planning start"
                      type="date"
                      value={s.calendar.start}
                      onChange={(v) =>
                        update((d) => {
                          d.calendar.start = v;
                        })
                      }
                    />
                    <Text
                      label="Planning end"
                      type="date"
                      value={s.calendar.end}
                      onChange={(v) =>
                        update((d) => {
                          d.calendar.end = v;
                        })
                      }
                    />
                    <Text
                      label="Timezone"
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
                    <h3>Get started</h3>
                    <p className="hint">
                      The pharmacy reference is a complete generic example: five
                      people, one closing duty per day, and continuous fairness
                      across a month boundary.
                    </p>
                    <div className="stack">
                      <button onClick={loadExample}>
                        Load pharmacy reference
                      </button>
                      <button onClick={blank}>Create an empty scenario</button>
                      <button
                        disabled={!s.shifts.some((sh) => sh.kind === "WORKING")}
                        onClick={simple}
                      >
                        Add simple balanced-duty template
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <h3>Search controls</h3>
                    <Text
                      label="Global solve time budget (seconds)"
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
                        label="Random seed"
                        type="number"
                        value={s.search.seed}
                        onChange={(v) =>
                          update((d) => {
                            d.search.seed = Number(v);
                          })
                        }
                      />
                      <Text
                        label="Workers"
                        type="number"
                        value={s.search.workers}
                        onChange={(v) =>
                          update((d) => {
                            d.search.workers = Number(v);
                            if (Number(v) > 1) d.search.deterministic = false;
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
                      Deterministic mode (one worker)
                    </label>
                  </section>
                </div>
                <section className="panel">
                  <h3>Portable configuration</h3>
                  <div className="row">
                    <button onClick={() => download(`${s.id}.json`, s)}>
                      Export scenario JSON
                    </button>
                    <label className="button">
                      Import scenario JSON
                      <input
                        hidden
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await importScenario(await file.text());
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <span className="hint">
                      Changes are saved in this browser. Export to move or back
                      up your workspace.
                    </span>
                  </div>
                </section>
              </>
            )}
            {tab === "people" && <People s={s} update={update} />}
            {tab === "shifts" && <Shifts s={s} update={update} />}
            {tab === "calendar" && <Calendar s={s} update={update} />}
            {tab === "policies" && <Policies s={s} update={update} />}
            {tab === "imports" && <Imports s={s} run={run} busy={busy} />}
            {tab === "results" &&
              (solved ? (
                <Results
                  s={solved.scenario}
                  r={solved.result}
                  previous={previous}
                  stale={stale}
                  run={run}
                  publish={() => {
                    update((d) => {
                      const keys = new Set(
                        solved.result.assignments?.map(
                          (a) => a.employeeId + ":" + a.date,
                        ),
                      );
                      d.publishedAssignments = [
                        ...d.publishedAssignments.filter(
                          (a) => !keys.has(a.employeeId + ":" + a.date),
                        ),
                        ...(solved.result.assignments || []),
                      ];
                    });
                    setMessage({ status: "IMPORTED", diagnostics: [] });
                  }}
                />
              ) : (
                <section className="empty-state">
                  <div className="empty-glyph">▦</div>
                  <h2>Your next schedule starts here</h2>
                  <p>
                    Generate a schedule to inspect assignments, coverage, and
                    cumulative fairness.
                  </p>
                  <button className="primary" onClick={() => run("solve")}>
                    Generate schedule
                  </button>
                </section>
              ))}
            {tab === "advanced" && (
              <>
                <EntityHeader title="Advanced JSON" />
                <p className="intro">
                  This is the same document used by the visual editors and CLI.
                  Apply only after core validation.
                </p>
                <section className="panel">
                  <label className="field">
                    <span>Scenario JSON</span>
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
                      Validate & apply JSON
                    </button>
                    <button onClick={() => setRaw(JSON.stringify(s, null, 2))}>
                      Reset editor from current scenario
                    </button>
                    <button onClick={() => download(`${s.id}.json`, s)}>
                      Export current scenario
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
          <footer>
            RosterCore <span>Open-source scheduling · Apache-2.0</span>
            <span>Local civil time · Exact rational fairness</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
