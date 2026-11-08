# Four implementation phases

| Phase | Working deliverable and verification | Status |
| --- | --- | --- |
| **1 — Foundations** | C++20/CMake, domain/calendar/groups/shifts, strict schemas/semantic checks, JSON CLI; initial build and validator tests passed. | Complete |
| **2 — Optimization** | Isolated CP-SAT adapter, reified nested logic, branch-local REMAINING, exact cumulative fairness, ordered metric solves, immutable prefix history and independent verifier; solver acceptance/property/exhaustive tests passed. | Complete |
| **3 — AI and HR integration** | Atomic CREATE/REPLACE, expected revisions, preview/draft/mapping, context/guide/catalog, dated historical rebuild, HR event revisions/tombstones/snapshots/protected-work checks; import/replay/conflict tests passed. | Complete |
| **4 — Playground and distribution** | Local React/TypeScript configurator and Node CLI adapter, recursive editors, schedule/coverage/debt charts, comparison, import/export/publication/consolidation, E2E, benchmark, install packaging and cross-platform CI configuration; local native/UI/API/browser/install checks passed. | Complete for local evaluation |

Scope and semantics: `ARCHITECTURE.md`. Verification and measured performance: `TEST_REPORT.md`. Explicit unsupported extensions and remaining platform/user acceptance: `LIMITATIONS.md`. Original requested behavior is summarized in English in `SPECIFICATION.md`.
