# Validation report · 0.3.0

Local environment: Ubuntu x86-64, GCC 15.2, CMake 4.2, Python 3.14, Node.js 22, OR-Tools 9.15.6755. Browser tests use installed Chrome through Playwright 1.56.1.

## Executed checks

- Release CMake configuration/build: passed without compiler warnings.
- `ctest --preset dev`: all five targets passed: native invariants, CLI startup, **37 legacy acceptance**, **42 evolution** and **18 automatic-assignment tests** (97 Python cases).
- TypeScript strict checking and Vite production build: passed.
- Browser suite: **20 passed**, 40.6 seconds. It uses actual CLI optimization/validation, not mocked solver results. Desktop and Italian mobile screenshots were inspected.
- Generated schemas: reproduced byte-for-byte. Diff whitespace checks passed.
- Additional schema-3 operational smoke: sudden leave followed by regeneration returned OPTIMAL and independently VERIFIED with two changes; schema version 3 and its automatic rules were preserved. The restarted playground served the new example/preview API successfully.
- Installed 0.3.0 CLI: inspect-patterns runs against the schema-3 example using installed schemas.
- Full 35-day automatic-pattern example: **OPTIMAL**, 163 assignments, 2.9201 seconds measured wall time; independent verify returns **VERIFIED**. This is a single measurement, not a latency guarantee.


## Coverage

The legacy suite preserves cumulative balancing/weighted conservation, rolling history, full boolean equivalence, branch-local REMAINING, revision-safe policy and HR operations, drafts/mapping, timeout truthfulness, independent tamper rejection, exhaustive small-model comparison and historical-context rebuilding.

The evolution suite covers ISO year/week 53, anchored arbitrary cycles and future versions, manual exceptions without phase shift, hard frequency conflicts/explicit waivers, solver-selected weeks, Italian legal-effective holidays/Pasquetta, profile operation and closures, typed defaults/false/missing values, dynamic selectors, dated employment/work patterns, part-time Friday variants, nonduplicated fairness tags, actual physical presence and interval handovers, distinct duty witnesses, primary/fallback priority, infeasibility without qualified reserves, next-day/night rest across profiles, spring/autumn elapsed DST rest, ambiguity rejection, sudden-event regeneration and stability, protected overnight closure conflicts, no retroactive hire quota, departed historical balances, retained history, new policy import, profile/coverage/metadata tampering, automatic first-week boundaries, profile-conditioned rest, frozen hours/unassigned prefix cells and privacy-conscious AI context retaining referenced predicate values.

Browser tests preserve legacy authoring/import/localization workflows and create catalogues, attributes, variants, arrangements and profiles without JSON. The pharmacy workflow previews part-time morning versus Friday hours, generates a roster, imports sudden approved leave, regenerates from the event date, observes the necessary reserve and explicit diff, independently verifies it, and switches the result to Italian. English/Italian catalogues and interpolation are checked across all new editors. Mobile width is checked at 390 pixels.


## UX and automatic-assignment regression coverage

New native cases check attribute defaults and explicit values; future changes; manual base/temporal precedence and return to automatic; incompatible ties and compatible same-pattern ties; higher priorities; enabled/effective/employment boundaries; dynamic groups; concrete variants/domain enforcement; verifier rejection; migration preserving individual assignments/history; future history continuity; unknown references/schema/date checks; effective pattern gaps and exclusive temporal expiry. Pattern-only preview remains usable before operational hours/policies are complete while full solve still rejects that unfinished configuration.

New browser cases cover bottom-fixed notifications during scrolling, translated successes, auto-dismiss, persistent errors/manual dismissal/full diagnostics, UNKNOWN/INFEASIBLE classification, browser-storage failure, the guided logical-shift/pattern/variant order, complete authoring from attributes through employees and variants without JSON, dynamic pattern/origin previews, manual-to-automatic return, reviewed future bulk changes, conflict diagnostics, mobile width and guarded catalogue deletion. A schema-2 scenario reload preserves its individually assigned patterns and schema number.

## Earlier 0.2 workload measurements

Single local measurements, seed 42/one worker; not latency guarantees. Full phase values/bounds are committed in `benchmark-results.json` and `evolution-benchmark-results.json`. Reproduce with `scripts/benchmark.py` and `scripts/benchmark_evolution.py`.

| Workload | Horizon | Budget | Result | Wall time |
| --- | --- | --- | --- | --- |
| Legacy, 5 people | 14 days | 8 s | OPTIMAL | 0.2134 s |
| Legacy, 15 people | 28 days | 8 s | OPTIMAL | 5.3108 s |
| Legacy, 40 people | 56 days | 8 s | UNKNOWN | 8.0718 s |
| Evolving pharmacy, 6 retained records | 35 days | 15 s | OPTIMAL, independently VERIFIED | 1.7143 s |
| Automatic week profiles, same workforce | 35 days | 15 s | FEASIBLE, independently VERIFIED | 15.8557 s |

The pharmacy includes part-time hours, future conversion, hire/departure, closure, two distinct closing duties, preferred reserve and Sunday night-to-Monday rest. Its full horizon needs one substitution. Automatic selection jointly solves weekly profiles and assignments, proving the early coverage/calendar stages but exhausting its budget during later fairness stages. UNKNOWN is not infeasibility; FEASIBLE is not a proof of all lexicographic optima. Preparation/verification can exceed the search budget.

## Native CI and Windows loader repair

The missing Windows DLL failure (`0xC0000135`) came from installed OR-Tools dependencies not fully represented by CMake imported-target runtime metadata. The build now stages installed dependency DLLs and inspects native PE imports with dumpbin, rejecting unresolved dependencies and retaining a dependency manifest. CLI startup remains a fail-fast CTest fixture; loader dialogs are disabled in test subprocesses. macOS retains an explicit framework install destination.

The focused repair, commit `356962e`, passed Linux, Windows and macOS: [GitHub run 42501192207](https://github.com/ossacolsale/rostercore/actions/runs/42501192207). The earlier schema-2 release, commit `61391b5`, also passed the entire Linux/Windows/macOS matrix, including core tests and UI builds on all three platforms plus Linux API/browser integration: [GitHub run 42506266884](https://github.com/ossacolsale/rostercore/actions/runs/42506266884). Dependency cache/failure artifacts remain enabled. The 0.3.0 release, commit `7d7a4e5`, passed Linux, Windows and macOS, including the full Linux API/browser suite: [GitHub run 42515437465](https://github.com/ossacolsale/rostercore/actions/runs/42515437465).

Final acceptance should use the intended workforce and explicitly review holiday operation, availability, publication and retained historical context. Supported limits are in `LIMITATIONS.md`.
