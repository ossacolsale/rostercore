# Validation report · 0.4.0

Environment: Ubuntu x86-64, GCC 15.2, CMake 4.2, Python 3.14, Node.js 22, OR-Tools 9.15.6755 and installed Chrome through Playwright 1.56.1. The following are executed results, not inferred product acceptance.

- Release build: passed without compiler warnings. Nine CTest targets passed in 60.86 seconds: core invariants/startup and **152 Python cases** (37 legacy, 42 evolution, 18 automatic assignment, 11 reliability, 18 archives, 12 spacing, 14 change sets).
- Complete browser suite: **24 passed**, approximately 1.1 minutes. A subsequent focused check passed after correcting simple-navigation contrast found during visual inspection; the check enforces at least 4.5:1 text contrast. Desktop/phone screenshots were inspected. Automated reflow checks cover 1280, 768 and 390 pixels plus 200% CSS layout scale, with label/control and page-overflow assertions. This is a layout-scale check, not an assertion about every browser's native zoom implementation.
- `npm ci`, `npm ls vite`, strict TypeScript and production build: passed. Vite **7.3.7**, plugin-react 5.1.0 and TypeScript 5.9.3 resolve together; npm reported zero vulnerabilities at installation time. Dependency changes are Vite and its required esbuild/platform packages, plus release version metadata.
- Both production and development API/SPA tests passed, including actual CLI validation, foreign Origin rejection, a raw HTTP foreign Host check, SPA fallback and development module transformation. HTTP and development HMR listeners are explicitly loopback-only. No demonstrated practical exploit is claimed for the audited older dependency.
- Installed 0.4.0 CLI passed version and validation of the complete schema-4 AI example using installed schemas. Generated schemas, capabilities and seven AI documents reproduce byte-for-byte. Whitespace checks passed.
- The user's unchanged original trial files were tested without committing personal data: two-week original **OPTIMAL, 1.943 s, zero substitutions**; longer original **OPTIMAL, 10.381 s, zero substitutions**, all seven phases optimal. The reproduced baseline longer run had stopped after approximately 30.4 s with two substitutions and bound zero; its necessity was unproved. Measurements include local concurrent workload and are not latency guarantees.

Reliability checks include absence, truly necessary fallback, multiple preference tiers, exact distinct duties/binding, timeout truthfulness, independent counterfactual improvement/proof and rejected untrusted phase claims. Archives cover original context/hash and browser numeric round trips, lifecycle/revision protection, completed-prefix advancement, repeated import/publication, actual-history conflicts, full recovery/CSV, missing contexts, new and profile-linked quota rebuilding. Spacing covers shared targets, weekday eligibility, actual normal assignments versus OFF/absence, calendar/normal boundaries, hard independent verification, category redefinition and no unneeded duties outside scope. Change sets exercise all seven AI examples, preserved unspecified/future employee fields, atomic rollback, revision/entity/receipt conflicts, explicit hard-rule authorization, protected domains/absence, future regeneration, continuing history for new hires, full-scenario preview and retained verified incumbents.

Browser integration creates a ten-person operational team visually, with roles/qualification, two distinct exact closing duties, reserve preferences, a part-time Friday-only pattern, combined fairness and spacing; it produces zero substitutes and independently VERIFIED assignments without JSON or numeric priorities. Other flows cover English/Italian parity, advanced editing, reload→open→publish→confirm actual prefix→backup→fresh-session restore→generate, minimized AI-package export and explicit change-set confirmation. Publication does not accrue actual history; quotas are not counted twice on recovery.

Cross-platform release CI is checked after push and recorded below. Remaining semantic/operational limits are in `LIMITATIONS.md`; final workforce/contract acceptance belongs to the user.

## Previous 0.3.0 release evidence

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
