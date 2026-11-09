# Architecture and mathematical contract

RosterCore 0.4 uses a stateless C++20 library and JSON CLI. The domain and interpreter do not expose OR-Tools. Structural validation precedes semantic normalization. The CP-SAT adapter compiles the same expressions evaluated independently by the verifier. A loopback-only Node adapter invokes the CLI with argument arrays, never a shell. No data is transmitted to AI/HR services.

## Time

Dates are strict proleptic Gregorian ISO dates, interpreted as local civil dates in the required IANA timezone label. Weekdays are ISO 1–7. Intervals use local wall-clock minutes, an explicit `endDayOffset` (0 or 1) and half-open bounds. COUNT uses civil dates. MIN_REST converts concrete intervals with offline UTC/Europe/Rome IANA transitions and explicit fold handling; unsupported zones and nonexistent/ambiguous local times fail rather than approximate elapsed duration. See `EVOLUTION.md` for effective dates, weekly precedence, physical coverage and dated-workforce semantics. Multiple disjoint and overnight intervals remain attached to their starting date.

## Assignment and logic

Every available employee gets exactly one admissible shift on each nonexcluded day. OFF is an explicit shift, never an automatic fallback. ABSENT, EXCLUDED, CLOSED and INACTIVE are result cell states, not ordinary shift assignments. Allowed-shift rules combine by intersection. Empty intersections are diagnostic infeasibility. Recurrences, date scopes and ISO week exclusions apply before model compilation.

Atoms COUNT compare selected assignments with EQ/GE/LE. AND/OR are fully reified equivalences, including the false direction. REMAINING restricts a selector to its shift plus explicit COUNT shifts on the **same selector** in its conjunctive branch. For unambiguous branch-local interpretation, REMAINING is permitted only as a direct child of AND whose other children are COUNT atoms (or REMAINING); OR may contain these branches and may otherwise nest freely. Mixed-selector or nested-branch REMAINING is rejected. COUNT GE remains GE; clause order has no effect. This conservative grammar avoids an exponential DNF expansion and ambiguous branch inheritance.

## Continuous fairness

For each objective and day, distribute the **produced** count of selected shifts among participants. EQUAL includes all selected employees, even absent ones. AVAILABILITY_WEIGHTED includes employees eligible for at least one target shift that day; CUSTOM_WEIGHTED uses positive integer configured weights among all selected employees. No produced assignments means no quota increment. A positive produced count with no eligible participants is rejected. Shares are reduced exact rational numbers; CP-SAT uses the LCM of per-day denominators and checked 64-bit scaling. Scales/models beyond conservative limits are rejected with a diagnostic; no rounding or hidden approximation.

History stores actual assignments **and dated participation snapshots** (weights for each objective). It never rolls over at calendar boundaries. Replay recomputes quotas from these records; objective changes require explicit rebuilding of snapshots against the original dated workforce/availability through `rebuild-history`, never silently reusing stale balances. Consolidation is append-only, records only the selected prefix and refuses overlaps. History snapshots carry an objective fingerprint. Boundary information remains available as dated assignments for future cross-day constraints.

Each objective contributes ordered metrics: maximum absolute debt at prefixes, sum of absolute debts at prefixes, final sum of absolute debts. Smaller numeric priority first; ties use policy ID lexicographic order, then metric order. Each proven optimum is fixed before the next solve. A global wall-time budget covers all phases. An unproven phase stops lexicographic optimization and returns FEASIBLE, or UNKNOWN if no incumbent; OPTIMAL requires every stage proven optimal. CONTINUOUS_BALANCED does not promise earliest possible debt recovery.

## Import and trust boundaries

Policy CREATE/REPLACE validates a copy of the entire scenario and returns it only after success. REPLACE requires an expected revision. Dry-run exposes before/after and history recalculation needs. Draft symbolic dependencies can be mapped explicitly; unresolved drafts cannot be active. Shared constraints are reusable definitions; `baseConstraintIds` activates global rules and active policies activate their references. They are never overwritten by a policy import. HR streams retain tombstones and monotonic revisions per source/external ID. Replayed equal revisions must match; lower revisions are ignored. Only APPROVED full-day events affect availability. Snapshot reconciliation requires an explicit source and snapshot revision. Changes conflicting with published or consolidated work are rejected atomically.

## Boundaries and risks

CP-SAT is a proven solver, but finite-horizon fairness is not an infinite-future guarantee. Runtime depends on scenario size. Strict caps protect numeric ranges, input size, dates, AST nodes and search resources. No labor-law compliance is implied. MINUTES, BURDEN_POINTS, EARLIEST_BALANCE, constraint-AST NOT/IMPLIES and operational partial-day leave are explicit unsupported extensions. Executed local and native CI evidence is recorded in the test report.


## Evolution modules

`calendar.cpp` resolves week classification, migration and offline catalogues. `workforce.cpp` resolves dated employees, predicates, domains, variants and physical spans. `evolution_validation.cpp` validates the additive declarative structures. `compiler_extensions.inc` stays inside the solver Compiler and contains weekly, coverage, temporal and stability CP-SAT variables. `verification.cpp` independently interprets chosen profiles, explicit duty witnesses, frequency counts, temporal rules and regeneration. The existing history interpreter retains dated participation snapshots and actual assignment intervals; new hires receive no earlier quota and departed people remain in replay. No reference-example role names occur in domain behavior.


## Automatic arrangements and progressive UX

`UX_ASSIGNMENTS.md` defines schema-3 precedence and migration. The workforce interpreter separates raw dated employee state from effective work-pattern resolution, so automatic selectors can reuse resolved attributes/groups without recursively resolving patterns. Domain/variant consumers and preview share that resolver; the verifier checks actual schedules against it. Individual source records are never rewritten by rule evaluation.

The playground's local progress/dependency checks guide unfinished forms; they do not replace C++ validation or reproduce scheduling resolution. Operation notifications are centralized, bounded and deduplicated, with persistent errors and explicit diagnostic actions. Logical shifts precede arrangements, and concrete variants have their own step after arrangements. Existing internal navigation IDs remain stable.

## Reliability and saved contexts (0.4)

Operational preference models are solved before constructing lower-priority fairness auxiliaries. This fixes the reproduced long-horizon fallback timeout while preserving one lexicographic CP-SAT model. Only a proved optimum is fixed before proceeding; intermediate incumbents supply verified assignment/week hints. Quality counterfactuals build the hard model independently and test a strictly smaller fallback tier under already verified earlier tiers. Restarted improvement carries a verified incumbent, never fabricates a CP-SAT solution or claims persistence of internal search state.

`spacing.cpp` defines candidate pairs and independent workload replay, using existing shift IDs/tags. Compiler hard pair constraints run before preference search; soft pair costs share explicit lexicographic ordering with fairness. Calendar distance and actual intervening normal assignments are separate units. Known pre-horizon published assignments supply temporal context without accruing actual-history quota. Week-profile provenance is retained at that boundary. Tagged schema-4 snapshots retain their resolved targets to detect changed category membership.

`archives.cpp` implements canonical verified contexts, publication/completion/revision transitions, idempotent history merging, portable backup/CSV and explicit dated historical reconstruction. `change_sets.cpp` applies only schema-catalogued operations to a private copy, checks revisions/receipts/protected assignments and validates the complete candidate before returning it. The simple UI is a question-oriented editor of the same Scenario. AI authoring is file exchange; the application does not contact an AI service.
