# Public JSON and CLI API · 0.1.0

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

Exit 0 means a well-formed operation completed, including INFEASIBLE/UNKNOWN; inspect `status`. Exit 2 means input/validation or verification/model errors. Exit 3 means an unexpected internal exception. A JSON parse failure is VALIDATION_ERROR with JSON_PARSE; duplicate object keys are rejected. No shell expressions or user-defined executable expressions are supported.

## Scenario

`schemas/scenario.schema.json` is the complete contract. See `examples/pharmacy.json`. Required fields are deliberately explicit to make imported configuration reviewable. IDs are stable and independent of display labels. Selector semantics and constraints are in `CONSTRAINT_GRAMMAR.md`; fairness/time conventions are in `ARCHITECTURE.md`.

`constraints` is the shared definition registry; `baseConstraintIds` activates base rules. Active policies additionally enforce their own rules and shared references/constraint sets within their scope. Shared rules can be referenced by multiple policies without being modified. All active policies optimize one combined assignment model. Unknown fields, unsupported operators, unsupported measures and inactive draft references that were not declared as dependencies are rejected.

The engine accepts at most 200 employees, 40 shift types, 366 horizon days, 1,000,000 assignment grid cells, 10,000 constraint nodes and AST depth 32. JSON CLI input is limited to 8 MiB and nesting 80. Worker count is 1–32, solve time budget 0–600 seconds, integer weights 1–1,000,000. Exact arithmetic has a conservative 10^12 bound, including LCM scaling. Resource-limit rejection is a validation diagnostic, never hidden rounding.

Civil dates are 1900–2200, weekdays ISO Monday=1. A timezone label is mandatory and must use UTC or IANA-style notation; timezone database existence is not resolved because this version does no elapsed-time conversion. A host needing strict timezone registry validation must supply it. Dates/ranges/ISO weeks and interval order/overlap are checked. Overnight intervals cannot cross into a globally excluded or individually absent date. Work intervals on consecutive dates, including the historical boundary, cannot overlap. No minimum-rest or maximum-hours labor rule is implicit.

## Results and reproducibility

Solver statuses: VALIDATION_ERROR, MODEL_INVALID, INFEASIBLE, FEASIBLE, OPTIMAL, UNKNOWN. Non-solver commands also use VALID, VERIFIED, PREVIEW, IMPORTED, CONSOLIDATED and CONTEXT. `diagnostics` contains code/path/message. Infeasibility assumptions identify a sufficient conflicting set, not a guaranteed minimal set; empty assignment domains are diagnosed before solving.

`metadata` records engine/backend versions, normalized configuration SHA-256, actual search parameters, policy revisions and wall time. Normalization sorts object keys and preserves array order; no defaults are inferred. Archive the **entire input scenario** with a result to reproduce it. Seed and one worker support deterministic search; wall-time cutoffs, platform and backend differences can still affect interrupted runs.

`phases` records each attempted lexicographic metric, status, integer scale, exact incumbent value and best scaled bound. The global time budget includes validation/model compilation; cancellation checks occur at phase boundaries and CP-SAT receives the remaining search budget. Model preparation and verification can exceed the search budget. An unproven phase stops subsequent optimization. If a prior incumbent exists, it remains FEASIBLE; OPTIMAL requires all requested phases to prove optimum. No nonzero gap tolerance is enabled.

`assignments` contains ordinary shifts. `calendarStates` contains ABSENT/EXCLUDED cells. `fairness` exposes exact rational initial/final values, dated prefixes and metrics. The engine runs `verify` before returning a solution; this verifier directly checks assignment completeness, domains, constraints, publication locks, overnight overlap and independently replays quota/debt accounting. It verifies feasibility/accounting, not mathematical optimality.

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
