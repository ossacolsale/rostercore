# Four implementation phases

| Phase | Working deliverable and verification | Status |
| --- | --- | --- |
| **1 — Foundations** | C++20/CMake, domain/calendar/groups/shifts, strict schemas/semantic checks, JSON CLI; initial build and validator tests passed. | Complete |
| **2 — Optimization** | Isolated CP-SAT adapter, reified nested logic, branch-local REMAINING, exact cumulative fairness, ordered metric solves, immutable prefix history and independent verifier; solver acceptance/property/exhaustive tests passed. | Complete |
| **3 — AI and HR integration** | Atomic CREATE/REPLACE, expected revisions, preview/draft/mapping, context/guide/catalog, dated historical rebuild, HR event revisions/tombstones/snapshots/protected-work checks; import/replay/conflict tests passed. | Complete |
| **4 — Playground and distribution** | Local React/TypeScript configurator and Node CLI adapter, recursive editors, schedule/coverage/debt charts, comparison, import/export/publication/consolidation, E2E, benchmark, install packaging and cross-platform CI configuration; local native/UI/API/browser/install checks passed. | Complete for local evaluation |

Scope and semantics: `ARCHITECTURE.md`. Verification and measured performance: `TEST_REPORT.md`. Explicit unsupported extensions and remaining platform/user acceptance: `LIMITATIONS.md`. Original requested behavior is summarized in English in `SPECIFICATION.md`.


## 0.2 evolution — four phases

| Phase | Implemented and checked | Status |
| --- | --- | --- |
| 1 — Calendars and migration | Declarative ISO profiles, recurrence versions, manual precedence/waivers, joint CP-SAT weeks/frequencies, offline Italian holidays, closures and compatible migration. Build and initial calendar tests passed. | Complete |
| 2 — Workforce and engine | Dated workforce/default predicates, arrangements/variants, interval coverage witnesses, qualified fallback stages, temporal/DST rules and retained fairness. Builds and mathematical/operational tests passed. | Complete |
| 3 — Guided playground and AI | Numbered catalogue editors, core-backed previews, visual recurrence/overrides, coverage/temporal forms, undo, bilingual results/regeneration and extended policy exchange. TypeScript/Vite and all 13 browser tests passed, including visual configuration without JSON. | Complete |
| 4 — Integration and distribution | 37 legacy + 42 evolution tests, HR-to-regeneration browser workflow, protected intervals/prefix checks, verified full examples, measured benchmarks, installed CLI and documentation. Focused Windows runtime repair passed native CI; release CI is checked after push. | Complete for local evaluation |

No industry behavior is embedded in the engine. The full five-week reference reaches OPTIMAL; the automatic-week example returns a verified FEASIBLE incumbent within its budget. Remaining bounds and operational responsibilities are explicit in `LIMITATIONS.md`.
