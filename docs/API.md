# Public JSON and CLI API · 0.4.0

All commands consume one UTF-8 JSON document per file (or `-` for stdin) and return one JSON result on stdout. The library/CLI is stateless. Import/consolidation commands return a **new scenario**; the host decides where to store it. They never overwrite an input file. Use temporary output files and atomic replacement in a persistent integration. stderr is reserved for process/backend diagnostics.

```sh
build/rostercore validate examples/pharmacy.json
build/rostercore solve examples/pharmacy.json > result.json
build/rostercore verify examples/pharmacy.json result.json
build/rostercore context examples/pharmacy.json > context-result.json
build/rostercore import-policy examples/pharmacy.json examples/policy-create.json
build/rostercore import-policy examples/pharmacy.json examples/policy-create.json --apply
build/rostercore import-policy examples/pharmacy.json examples/policy-draft.json --mappings mapping.json
build/rostercore sync-hr examples/pharmacy.json examples/hr-events.json --apply
build/rostercore consolidate examples/pharmacy.json result.json 2026-02-01
build/rostercore rebuild-history current-scenario.json historical-contexts.json --apply
```

Imports default to dry-run (`PREVIEW`). `--apply` returns `IMPORTED` with `scenario`. `--mappings` is an object such as `{"@duty":"closing"}`; CREATE/REPLACE still validate the entire resulting scenario. A mapped draft can remain inactive; activate it explicitly with draft=false and active=true after resolving all dependencies. `context` wraps the exported AI document under `context`; the playground exports that inner document directly. `version` and `help` return human-readable text.

Exit 0 means a well-formed operation completed, including INFEASIBLE/UNKNOWN; inspect `status`. Exit 2 means input/validation or verification/model errors. Exit 3 means an unexpected internal exception. A JSON parse failure is VALIDATION_ERROR with JSON_PARSE; duplicate object keys are rejected. No shell expressions or user-defined executable expressions are supported. Python integrations on Windows should use `encoding="utf-8"` when capturing the UTF-8 JSON stream. The build stages required Windows DLLs next to each executable.

## Scenario

`schemas/scenario.schema.json` is the complete contract. See `examples/pharmacy.json`. Required fields are deliberately explicit to make imported configuration reviewable. IDs are stable and independent of display labels. Selector semantics and constraints are in `CONSTRAINT_GRAMMAR.md`; fairness/time conventions are in `ARCHITECTURE.md`.

`constraints` is the shared definition registry; `baseConstraintIds` activates base rules. Active policies additionally enforce their own rules and shared references/constraint sets within their scope. Shared rules can be referenced by multiple policies without being modified. All active policies optimize one combined assignment model. Unknown fields, unsupported operators, unsupported measures and inactive draft references that were not declared as dependencies are rejected.

The engine accepts at most 200 employees, 40 shift types, 1,096 horizon days, 1,000,000 assignment grid cells, 10,000 constraint nodes and AST depth 32. JSON CLI input is limited to 8 MiB and nesting 80. Worker count is 1–32, solve time budget 0–600 seconds, integer weights 1–1,000,000. Exact arithmetic has a conservative 10^12 bound, including LCM scaling. Resource-limit rejection is a validation diagnostic, never hidden rounding.

Civil dates are 1900–2200, weekdays ISO Monday=1. A timezone label is mandatory and must use UTC or IANA-style notation; civil scheduling preserves that label. MIN_REST requires supported offline timezone data (UTC or Europe/Rome, 2000–2100). Dates/ranges/ISO weeks and interval order/overlap are checked. Overnight intervals cannot cross into a globally excluded or individually absent date. Work intervals on consecutive dates, including the historical boundary, cannot overlap. No minimum-rest or maximum-hours labor rule is implicit.

## Results and reproducibility

Solver statuses: VALIDATION_ERROR, MODEL_INVALID, INFEASIBLE, FEASIBLE, OPTIMAL, UNKNOWN. Non-solver commands also use VALID, VERIFIED, PREVIEW, IMPORTED, CONSOLIDATED CONTEXT, MIGRATED and INSPECTED. `diagnostics` contains code/path/message. Infeasibility assumptions identify a sufficient conflicting set, not a guaranteed minimal set; empty assignment domains are diagnosed before solving.

`metadata` records engine/backend versions, normalized configuration SHA-256, actual search parameters, policy revisions and wall time. Normalization sorts object keys and preserves array order; no defaults are inferred. Archive the **entire input scenario** with a result to reproduce it. Seed and one worker support deterministic search; wall-time cutoffs, platform and backend differences can still affect interrupted runs.

`phases` records each attempted lexicographic metric, status, integer scale, exact incumbent value and best scaled bound. The global time budget includes validation/model compilation; cancellation checks occur at phase boundaries and CP-SAT receives the remaining search budget. Model preparation and verification can exceed the search budget. An unproven phase stops subsequent optimization. If a prior incumbent exists, it remains FEASIBLE; OPTIMAL requires all requested phases to prove optimum. No nonzero gap tolerance is enabled.

`assignments` contains ordinary shifts. `calendarStates` contains ABSENT/EXCLUDED/CLOSED/INACTIVE cells. `fairness` exposes exact rational initial/final values, dated prefixes and metrics. The engine runs `verify` before returning a solution; this verifier directly checks assignment completeness, domains, constraints, publication locks, overnight overlap and independently replays quota/debt accounting. It verifies feasibility/accounting, not mathematical optimality.

## Rolling horizon and rebuilding history

`consolidate` checks the result against the exact input hash, verifies it, appends assignments/snapshots through the requested date and advances calendar.start. The watermark prevents overlapping consolidation. Consolidating the entire horizon creates a one-day next window; extend its end explicitly. Retained future publication locks remain in force.

Participation snapshots include an objective fingerprint and dated employee weights. Metrics, priority and label edits do not change that fingerprint; participant/category/weight/scope changes do. The solver rejects stale/missing relevant historical snapshots. To rebuild, supply:

```json
{"format":"rostercore.history-contexts","schemaVersion":1,"scenarios":["replace this string with complete historical scenario objects"]}
```

The illustrative string above is **not valid input**: `scenarios` must contain full documents matching the scenario schema. Each context represents the workforce, allowed shifts, exclusions and availability as they applied on those past dates; it must use references compatible with the new objective definitions. Contexts cannot overlap and must cover all historical assignment dates. New objectives are evaluated against these contexts. Existing assignment records are preserved byte-for-byte as JSON values; only active-objective participation snapshots are replaced. Rebuilding is explicit, previewable and atomic. The core cannot infer unavailable historical workforce data or silently rebuild from today's availability.

## HR events

`schemas/hr-events.schema.json` and `examples/hr-events.json` define whole-day events. Identity is (source, externalId); eventId identifies an event version. Monotonic revisions retain the latest state, including DELETE tombstones. Replaying an equal event revision requires an identical payload; lower revisions are ignored. Only APPROVED UPSERT records affect availability. REQUESTED/REJECTED events are retained without blocking assignments. Partial intervals are represented by the contract but operational use is rejected.

Optional `snapshot:{source,revision}` is an authoritative source snapshot. Its revision is a source-wide high watermark, must be greater than the previous snapshot, and must be at least every included event revision. Missing source records at or below the watermark become tombstones; newer records remain. Later incremental events at or below the watermark cannot resurrect missing leave. Older/equal snapshots are ignored. Supply one complete authoritative source snapshot, not a partial page. Changes conflicting with any retained published or consolidated working assignment (including an overnight spill) fail atomically. Mutable simulations must be regenerated explicitly.

## Integration examples

Python:

```python
import json, subprocess
result = json.loads(subprocess.run(
    ["build/rostercore", "solve", "-"], input=json.dumps(scenario),
    text=True, capture_output=True, check=True).stdout)
if result["status"] in ("FEASIBLE", "OPTIMAL"):
    assignments = result["assignments"]
```

Node.js: use `spawn`/`execFile` with an argument array and write JSON to stdin. .NET: use `ProcessStartInfo.ArgumentList`, redirect stdin/stdout and parse with System.Text.Json. Do not interpolate JSON into a shell command. C++ hosts can link the `rostercore` CMake target and call `validate`, `solve`, `verify` and import functions from `include/rostercore/core.hpp`. The C++ API is source-level and not a stable ABI; a future C ABI will wrap serialized input/output with versioned error and ownership conventions. No HTTP service is part of the core; the supplied loopback adapter is a development playground only.


## Schema 2 calendar and workforce operations

```sh
build/rostercore migrate examples/pharmacy.json > migration.json
build/rostercore inspect examples/pharmacy-evolution.json 2027-05-10
build/rostercore select examples/pharmacy-evolution.json selector.json 2027-05-10
build/rostercore solve examples/pharmacy-evolution.json > result.json
build/rostercore regenerate changed-scenario.json regeneration.json
```

`migrate` returns MIGRATED with `scenario` and migration metadata; save the inner scenario. `inspect` returns INSPECTED, weekly profile options, holiday annotations, active workforce, resolved attribute values/origins, groups and concrete admissible hours at the requested date. `select` additionally validates a `selector.schema.json` document and returns `workforce.selectedEmployeeIds`. All use the same validators as solve.

Schema 2 adds `attributeDefinitions`, `workPatterns`, `weekProfiles`, `weekConfiguration`, `dutyRequirements` and `temporalRules`. Effective records use `[validFrom,validTo)`; legacy scope start/end remain inclusive. `weekConfiguration` contains manual, recurrences, frequencies and historical choices, plus optional defaultProfileId/automatic. Recurrence boundaries are Mondays; anchors normalize to Mondays. Profiles can activate shared rules and policies. `scope.weekProfileIds` and dayType gate rules/objectives. Selectors support typed `where` predicates; explicit null suppresses an attribute default.

Duty requirements distinguish RESPONSIBILITY (one selected witness covering all required intervals) and PRESENCE (qualified headcount at every interval change point). Levels are explicit selectors with 0 primary and increasing fallback levels. A shared exclusiveGroup requires distinct people. Solver results include verified `coverage` witnesses and primary/substitution annotations. Fallback stages precede desired calendar frequency, stability and fairness; higher fallback levels are eliminated first within each configured priority. See the complete pharmacy examples for concrete declarations.

A regeneration request is `{"from":"2027-05-10","previousScenario":{...},"previousResult":{...},"stabilityPriority":"BEFORE_FAIRNESS"}` (replace placeholders with full valid documents). The previous result must verify against its own scenario/hash. Dates before from are frozen; history and published locks still apply. AFTER_FAIRNESS is also supported. The response contains its effective `scenario` with explicit replanning baseline, chosen weeks, concrete assignments, coverage and `changes` with before/after logical IDs and intervals. Verify the result against that returned scenario. No operation overwrites the input.

Known diagnostics add severity, object IDs, editor section and a suggestion where available; original code/path/message are retained. Validate may return informational/warning diagnostics without making the input invalid. Strict unknown-property/operator checks still apply.


## Schema 3: automatic work-pattern assignments

Schema 1/2 scenarios remain supported. `migrate` explicitly returns schema 3, preserving employee IDs, base/dated manual patterns, published assignments and history. The migration adds an empty workPatternAssignmentRules catalogue; it never infers rules or replaces individual assignments.

```json
{
  "id":"automatic-full", "label":"Full-time employees", "enabled":true,
  "selector":{"where":{"op":"EQ","attributeId":"contract","value":"FULL_TIME"}},
  "workPatternId":"full", "priority":10, "validFrom":"2027-01-01"
}
```

Place rules in scenario.workPatternAssignmentRules; optional validTo is exclusive. Higher numeric priority wins. Effective employment/default and dated attributes/dynamic groups are evaluated on the requested date using the existing selector grammar. Resolution precedence is effective employee-version pattern override, explicit individual base pattern, applicable automatic rule, then existing unrestricted behavior. Equal top-priority rules pointing to different patterns fail with WORK_PATTERN_ASSIGNMENT_CONFLICT; same-pattern ties are compatible. Disabled/ineffective rules do not participate. A referenced pattern must have an effective version.

A schema-3 employee version may set `workPatternId:null` to return explicitly to automatic rules for that interval, suppressing the base pattern. Omitting the property still inherits the base. Ending that interval restores the usual precedence. A base automatic choice is represented by omitting employee.workPatternId. No automatic association is copied into employees. Domain resolution, concrete variants, solve and independent verification all use Scenario::workPatternAssignment. Retain dated rules/arrangements needed by historical boundary checks.

```sh
build/rostercore inspect-patterns examples/automatic-work-patterns.json 2027-06-01
build/rostercore inspect examples/automatic-work-patterns.json 2027-06-01
```

`inspect-patterns` returns INSPECTED with workforce.employees (active flag, profile ID, resolved attributes, effective workPatternAssignment origin/ID/ruleIds) and workforce.rules (matching employee IDs per profile). Conflicts and gaps remain per-employee ERROR diagnostics while other rows remain available; unassigned active employees produce a warning when rules exist. INSPECTED means the preview was computed, **not** that the scenario passed full validation. Structural failures and invalid workforce-resolution references still return VALIDATION_ERROR. Pattern preview validates the workforce/assignment dependencies without requiring completed shift hours, coverage or policies; it does not certify those other sections. Standard validate/solve reject conflicting assignments. Free weekly-profile alternatives can yield multiple profile-specific preview rows.

The new declarations are part of schema 3. Older schema numbers containing automatic rules or explicit null temporal overrides require migration, rather than silently changing the older contract. Policy exchange accepts engine 0.3.0/schema 3; AI context includes rule definitions and referenced dated attribute values. The loopback adapter whitelists inspect-patterns as a fixed CLI action.

## 0.4 reliability, archives and complete configuration

The current scenario contract is schema 4; schemas 1–3 remain readable. `migrate` now targets 4 and preserves IDs, individual assignments and actual history. New declarations are optional: weekdayShifts on pattern versions, spacingRules, explicit dutyBindingMode, archive links/proposals and applied-change-set receipts. New simple scenarios use GLOBAL duty binding; older scenarios retain ACTIVE_SCOPE unless explicitly changed. The new authoring guide describes both meanings and real eligibility for bound responsibilities.

| Command | Input / result |
| --- | --- |
| `verify-quality SCENARIO RESULT [SECONDS]` | Hard replay first, exact original configuration hash, then independent lexicographic fallback counterfactuals. QUALITY_VERIFIED, QUALITY_UNKNOWN or QUALITY_IMPROVABLE; scope FALLBACK. Defaults to 15 seconds, range 0–600. |
| `improve SCENARIO REQUEST` | previousScenario, previousResult, maxTimeSeconds; optional original previousScenarioEncoding for legacy numeric encoding. Business declarations must be unchanged. Verified hints and a fallback lexicographic upper bound; retains the verified prior incumbent if search yields none or no demonstrated improvement. Returns the new scenario/search context. |
| `archives SCENARIO REQUEST` | Typed archive-request schema: archives list, operation, dryRun, expectedRevision for mutations, optional at. Native preview returns candidate scenario/catalogue under preview; apply returns updated top-level state. |
| `change-set SCENARIO DOCUMENT [--apply]` | Typed atomic scenario-change-set; preview by default. Revision/configuration/entity hashes and receipt replay; exactly one scenario revision on successful application. |
| `import-scenario SCENARIO REQUEST [--apply]` | Candidate full scenario, expectedRevision, NEW_SCENARIO/REPLACE_CURRENT mode and explicit hard-rule flag. Same-ID replacement preserves actuals, publication locks and receipts. |

Archive operations: CREATE contextual verified draft, OPEN original calendar, CSV readable quoted export, IMPORT with REFERENCE/PUBLISH/COMPLETE/RESTORE_CONTEXT, PUBLISH future locks, COMPLETE explicitly worked inclusive prefix, REVISE future proposal, BACKUP whole workspace, RESTORE verified backup, REBUILD_HISTORY from original completed archive contexts. Rebuilding requires useCurrentCategoryMembership true: current category tags classify the same actual historical shifts, while original workforce, hours, availability and profiles determine eligibility. It stops if any actual date lacks original context; no retrospective weights are guessed. Active-objective snapshots are rebuilt; actual assignment records stay intact. Manual history-context import remains available when archives are incomplete.

A schedule-archive version 1 stores immutable id/context/result/period/provenance plus revisioned DRAFT/PUBLISHED/COMPLETED/SUPERSEDED lifecycle, completedThrough and publication links. COMPLETED can cover a prefix while future dates remain published. Publication alone adds no actual history. Exact original scenarioEncoding preserves pre-schema-4 configuration hashes across JavaScript's 0.0→0 round trip. Archive/backup hashes normalize integral floating numbers; input integers beyond the JavaScript safe range are rejected. Hashes detect content mismatch; they are not signatures or proof that somebody actually worked a shift. Only explicit user confirmation creates an actual prefix.

`quality.fallback` separates incumbent counts, lower bounds and solver proof status. Independent verification of hard feasibility/accounting does not certify imported optimality claims; use verify-quality. A global minimum does not identify a uniquely unavoidable person/date. `workload` independently replays burden totals/per-type counts, prior known assignments, minimum gaps, consecutive/close pairs and costs. Hard spacing is checked even when the input result omits that report. Optimization phases for spacing use `policyId: spacing:<ruleId>` and CLOSE_PAIRS/GAP_DEFICIT metrics, avoiding collisions with fairness policy IDs. Smaller priorities run first; tied fairness policies retain policy-ID order, followed by tied spacing rules in declaration order. Bounds and unfinished phases remain visible.

Default SIMPLE and ADVANCED edit the same JSON and call these native operations. The optional AI package contains current versions, compact referenced schemas, guides, capabilities, stable catalogs, scenario revision/hash and entity hashes. Personal data is minimized by default; full scenario export is explicit. Eight-MiB input and local-storage capacity limits also apply to archive collections/backups. Export portable backups regularly; no server database is implied.
