# Architecture and mathematical contract

RosterCore 0.1 uses a stateless C++20 library and JSON CLI. The domain and interpreter do not expose OR-Tools. Structural validation precedes semantic normalization. The CP-SAT adapter compiles the same expressions evaluated independently by the verifier. A loopback-only Node adapter invokes the CLI with argument arrays, never a shell. No data is transmitted to AI/HR services.

## Time

Dates are strict proleptic Gregorian ISO dates, interpreted as local civil dates in the required IANA timezone label. Weekdays are ISO 1–7. Intervals use local wall-clock minutes, an explicit `endDayOffset` (0 or 1) and half-open bounds. No implicit timezone conversion or elapsed-duration calculation occurs. This version optimizes COUNT only. Actual elapsed minutes across DST transitions, partial-day leave and hourly coverage are rejected as unsupported, rather than interpreted as civil-duration guarantees. Multiple disjoint intervals, including overnight intervals, are preserved.

## Assignment and logic

Every available employee gets exactly one admissible shift on each nonexcluded day. OFF is an explicit shift, never an automatic fallback. ABSENT and EXCLUDED are result cell states, not ordinary shift assignments. Allowed-shift rules combine by intersection. Empty intersections are diagnostic infeasibility. Recurrences, date scopes and ISO week exclusions apply before model compilation.

Atoms COUNT compare selected assignments with EQ/GE/LE. AND/OR are fully reified equivalences, including the false direction. REMAINING restricts a selector to its shift plus explicit COUNT shifts on the **same selector** in its conjunctive branch. For unambiguous branch-local interpretation, REMAINING is permitted only as a direct child of AND whose other children are COUNT atoms (or REMAINING); OR may contain these branches and may otherwise nest freely. Mixed-selector or nested-branch REMAINING is rejected. COUNT GE remains GE; clause order has no effect. This conservative grammar avoids an exponential DNF expansion and ambiguous branch inheritance.

## Continuous fairness

For each objective and day, distribute the **produced** count of selected shifts among participants. EQUAL includes all selected employees, even absent ones. AVAILABILITY_WEIGHTED includes employees eligible for at least one target shift that day; CUSTOM_WEIGHTED uses positive integer configured weights among all selected employees. No produced assignments means no quota increment. A positive produced count with no eligible participants is rejected. Shares are reduced exact rational numbers; CP-SAT uses the LCM of per-day denominators and checked 64-bit scaling. Scales/models beyond conservative limits are rejected with a diagnostic; no rounding or hidden approximation.

History stores actual assignments **and dated participation snapshots** (weights for each objective). It never rolls over at calendar boundaries. Replay recomputes quotas from these records; objective changes require explicit rebuilding of snapshots against the original dated workforce/availability through `rebuild-history`, never silently reusing stale balances. Consolidation is append-only, records only the selected prefix and refuses overlaps. History snapshots carry an objective fingerprint. Boundary information remains available as dated assignments for future cross-day constraints.

Each objective contributes ordered metrics: maximum absolute debt at prefixes, sum of absolute debts at prefixes, final sum of absolute debts. Smaller numeric priority first; ties use policy ID lexicographic order, then metric order. Each proven optimum is fixed before the next solve. A global wall-time budget covers all phases. An unproven phase stops lexicographic optimization and returns FEASIBLE, or UNKNOWN if no incumbent; OPTIMAL requires every stage proven optimal. CONTINUOUS_BALANCED does not promise earliest possible debt recovery.

## Import and trust boundaries

Policy CREATE/REPLACE validates a copy of the entire scenario and returns it only after success. REPLACE requires an expected revision. Dry-run exposes before/after and history recalculation needs. Draft symbolic dependencies can be mapped explicitly; unresolved drafts cannot be active. Shared constraints are reusable definitions; `baseConstraintIds` activates global rules and active policies activate their references. They are never overwritten by a policy import. HR streams retain tombstones and monotonic revisions per source/external ID. Replayed equal revisions must match; lower revisions are ignored. Only APPROVED full-day events affect availability. Snapshot reconciliation requires an explicit source and snapshot revision. Changes conflicting with published or consolidated work are rejected atomically.

## Boundaries and risks

CP-SAT is a proven solver, but finite-horizon fairness is not an infinite-future guarantee. Runtime depends on scenario size. Strict caps protect numeric ranges, input size, dates, AST nodes and search resources. No labor-law compliance is implied. MINUTES, BURDEN_POINTS, EARLIEST_BALANCE, NOT/IMPLIES, hourly coverage and operational partial-day leave are explicit unsupported extensions. Cross-platform CI is configured; only locally executed builds are claimed in the test report.
