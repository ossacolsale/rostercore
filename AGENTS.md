# RosterCore — agent operating contract

Adapted from [AgentForge Universal AGENTS.md](https://github.com/ossacolsale/AgentForge-Universal-AGENTS.md). This file governs work; requirements live in `docs/SPECIFICATION.md`.

- Inspect Git and relevant code before editing; preserve unrelated user changes. Read only documents needed for the task. `docs/ARCHITECTURE.md` defines semantics and `docs/PROGRESS.md` records the four implementation phases.
- Deliver the smallest **complete** useful change. Prefer development progress and runnable features over polishing every intermediate step. Conserve tokens: avoid repeated audits, verbose logs, speculative abstractions and redundant documentation. The user performs final product acceptance and can request refinements.
- Use English for code, documentation, UI, commit messages and communication unless the user subsequently requests otherwise.
- That preference never permits fake functionality, silent violations of hard constraints, weakened validation, lost history, secrets in commits or claims about checks that were not run. Run focused automated checks proportionate to the change; fix substantive failures.
- Keep domain, validation, constraint AST, history, objectives, CP-SAT adapter and integrations separate. No industry-specific behavior in the core. Stable IDs, versioned JSON, strict unknown-property rejection, exact fairness accounting and explicit unsupported features are invariants.
- Public behavior must agree across CLI, JSON imports and playground. All paths use the same core validators and solver. Never treat AI-generated JSON as executable input.
- Keep durable facts in one authoritative document. Update contracts, examples and documentation only when affected. Record real limitations plainly. Do not inflate this file into a design manual or transcript.
- Follow the four phases from the specification; do not ask for approval at routine boundaries. Continue autonomously within the user's authorization. For this initial implementation the user explicitly authorizes version advancement, commits and push. Do not force-push, rewrite unrelated history, publish secrets or deploy unrelated services.
- Use C++20/CMake for the library and CLI; React/TypeScript/Vite plus a local Node process adapter for the playground. Keep solver-specific types inside `src/solver.cpp`.
- Build: `cmake --preset dev && cmake --build --preset dev`. Test: `ctest --preset dev`. Playground: `cd playground && npm ci && npm run build`; `npm run dev` starts the local UI and adapter. See README for dependency bootstrap.
- Before handoff, check the diff and run the relevant integration checks once. Report verified outcomes, how to try the product and material limitations concisely. The user's final review complements automated checks.
