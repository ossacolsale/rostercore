# Validation report · 0.1.0

Local environment: Ubuntu 26.04.1 x86-64, GCC 15.2.0, CMake 4.2.3, Python 3.14.4, Node.js 22.22.1, OR-Tools 9.15.6755. Browser tests use installed Google Chrome through Playwright 1.56.1 because that Playwright version does not offer a browser download for the host's Ubuntu release.

## Executed checks

- CMake Release configuration and native build: passed.
- `ctest --preset dev`: passed both test targets. The CLI acceptance suite contains **37 tests**, plus a native core-invariant executable. Final integration run: 30.30 seconds total.
- `npm run build`: passed TypeScript strict checking and Vite production build.
- `npm run test:server`: passed the loopback API integration test with the actual native executable.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: **11 passed**, 17.1 seconds in the localization update, including a complete empty-to-solved visual workflow.
- `cmake --install build --prefix /tmp/rostercore-install`: passed. The installed CLI validated the reference scenario; runtime linkage had no unresolved libraries and no dependency paths into the repository.
- Generated schemas were regenerated and compared byte-for-byte with their source: passed. `git diff --check`: passed. The native TGZ archive was generated at `build/packages/rostercore-0.1.0-Linux.tar.gz`, extracted and smoke-tested: OPTIMAL, with counts 2/3/3/3/3. Cross-platform jobs are configured in `.github/workflows/ci.yml`; local results do not establish remote Windows/macOS success.

## Acceptance coverage

The first 22 named acceptance tests map to the mandatory cases in the initial specification: 3-person continuous balance; 14 assignments among 5 people; month boundary; rolling horizons; absence; global exclusions; overlapping groups; nested boolean equivalence; branch-local REMAINING preserving GE; understaffing; multiple policies; priority/tie order; replacement; revision conflict; unknown references; drafts/mapping; atomic failure; HR replay/out-of-order updates; HR correction/deletion/snapshots/protected work; objective-change history diagnostics; timeout classification; unsupported input.

Additional tests cover weighted quota conservation, tampered assignments/fairness, eight seeded randomized balancing scenarios, calendar/group/interval validation, requested HR leave, ambiguous REMAINING, minimal AI context, exhaustive enumeration of all 3-person/3-day duty sequences against the solver's exact lexicographic objective vector, explicit historical-context rebuilding, shared-rule activation, overnight and historical-boundary overlap, shipped policy examples, undeclared draft references, consolidated HR protection and duplicate JSON keys. The native executable checks SHA-256 standard vectors, rational reduction/addition/subtraction, leap dates/ISO weeks and overflow rejection. Assertions remain active in Release builds.

The browser suite exercises real schedule generation and independent verification; visual people/shift/recursive rule edits; policy preview and confirmation; HR import followed by visible absence; rejection of foreign origins/arbitrary commands; and creating, configuring and solving an empty scenario entirely through visual controls. Localization coverage includes immediate English/Italian switching across all sections, browser persistence, unchanged scenario data and solved assignments, Italian metrics/statuses/weekdays, localized schema/reference/JSON errors with original details, mobile layout, and catalogue/interpolation completeness. The Italian mobile screenshot was inspected; visual acceptance remains with the user.

## Benchmarks

Command: `python3 scripts/benchmark.py build/rostercore`. Fixed seed 42, one worker, 8-second global solve budget. Full phase values and bounds: `benchmark-results.json`.

| Employees | Horizon | Status | Measured wall time | Ordinary assignments |
| --- | --- | --- | --- | --- |
| 5 | 14 days | OPTIMAL | 0.4365 s | 70 |
| 15 | 28 days | FEASIBLE | 8.0696 s | 420 |
| 40 | 56 days | UNKNOWN | 8.3842 s | 0 |

These are single local measurements, not performance guarantees. Larger models can exhaust the budget before finding an incumbent. UNKNOWN is not INFEASIBLE. The global search cutoff can be exceeded by model setup/verification. The example's five employees receive closing counts 3/3/3/3/2; any tied permutation is valid. An exact equal-share prefix lower bound improves proof of the fairness optimum without imposing an additional business rule.

## Remaining acceptance

Run the playground with a real intended workforce and inspect policies, availability, publication and historical context. Observe Windows/macOS CI before relying on those packages. Unsupported extensions and operational boundaries are documented in `LIMITATIONS.md`; none are presented as working.

## CI portability fix

The reported macOS configure failure is addressed by an explicit framework install destination. Windows native executables now stage the transitive DLLs described by their CMake targets beside the binaries. A 30-second CTest startup fixture verifies CLI loading and schema availability before the acceptance suite; standalone acceptance runs perform the same preflight. The Python launcher disables Windows loader dialogs in child processes, closes unused stdin, uses UTF-8 explicitly and reports exit codes in hexadecimal.

Local verification: Release configure/build passed; all three CTest targets passed (including 37 acceptance tests, 32.73 seconds total); installed CLI startup/schema validation passed. A configure-only Windows-target DLL graph probe checked direct/transitive dependencies, paths with spaces and empty runtime lists; no Windows binary was executed locally. Launcher checks covered EOF, UTF-8 round-trip and nonzero exit reporting. Native macOS/Windows validation remains with the new CI run.

The workflow saves installed dependencies immediately after bootstrap, even if a later project check fails, and uploads CMake/CTest diagnostics on every failed platform. Source and build intermediates are excluded from the new dependency cache.
