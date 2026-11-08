# RosterCore

**Open-source workforce scheduling powered by constraint optimization and continuous fairness.**

RosterCore generates workforce schedules from declarative rules using a C++20 engine and Google OR-Tools CP-SAT, with a local visual playground and **fairness that carries over across planning periods**.

Designed for integration into desktop applications and backend services, RosterCore aims to remain independent of any specific industry. Pharmacies are the initial reference use case, but the model is intended for healthcare, retail, hospitality, manufacturing, and other shift-based workplaces.

> [!IMPORTANT]
> **Version 0.2.0 — ready for local evaluation.** The native CLI and visual playground run real optimization and verify returned assignments. This is an initial release with explicit limits, not a certified HR system. See [implemented scope and limitations](docs/LIMITATIONS.md).

## Why RosterCore?

A valid roster is not necessarily a good roster. A scheduling engine should satisfy staffing and availability requirements **and** distribute recurring duties fairly over time.

A common approach balances assignments within a fixed week or month. That boundary can be arbitrary: fairness may require three weeks and two days, for example, and a monthly reset can erase an imbalance that has not yet been corrected.

RosterCore implements **continuous, history-aware fairness**: it will optimize finite planning windows while preserving the effects of previously completed assignments.

## Implemented capabilities

- **Dated workforce:** typed/default attributes, predicates, employment changes, reusable work patterns and logical shift variants.
- **Weekly calendars:** manual/recurring/solver-selected ISO profiles, hard/desired frequencies, versioned Italian holidays and company closures.
- **Operational coverage:** actual interval presence, distinct qualified responsibilities, lexicographic fallback resources and cross-day/rest rules.
- **Composable hard constraints:** exact/minimum/maximum staffing counts, allowed shifts, exclusions, and nested `AND`/`OR` expressions.
- **Reusable planning policies:** a named objective together with its associated constraints and references to shared rules.
- **Continuous fairness:** cumulative assignment counts, ideal shares, historical balances, and optimization across rolling planning horizons.
- **Multiple objectives:** explicit priorities and lexicographic optimization, rather than arbitrary blending of unrelated goals.
- **Portable integration:** a native C++ engine with a versioned JSON interface and a command-line entry point.
- **AI-assisted authoring:** documented, schema-validated policy files that can be drafted by an AI assistant and reviewed before import.
- **Visual configuration:** a local playground for building scenarios, composing rules, inspecting schedules, and diagnosing infeasibility.
- **HR interoperability:** vendor-neutral JSON exchange for approved leave, absences, updates, and cancellations.
- **Transparent results:** solver status, validation errors, fairness metrics, and reproducibility metadata.

See [public contracts and commands](docs/API.md), [architecture and semantics](docs/ARCHITECTURE.md), and [test evidence](docs/TEST_REPORT.md).

## How the model fits together

```text
Employees / Roles / Groups       Shift Types / Calendars / Availability
              \                                  /
               \                                /
                      Planning Scenario
                              |
              +---------------+---------------+
              |                               |
        Shared Constraints               Planning Policies
                                             |
                                    Objective + Constraints
              |                               |
              +---------------+---------------+
                              |
                       Model Compiler
                              |
                    OR-Tools CP-SAT Solver
                              |
                  Verified Schedule + Metrics
                              |
                 History / Fairness Balances
                              |
                       Next Planning Window
```

### Constraints vs. objectives

**Hard constraints** decide whether a schedule is valid. Examples include requiring exactly one qualified employee on closing duty or preventing a person on approved leave from being assigned a shift.

**Objectives** rank valid schedules. For example, a fairness objective may aim to distribute closing shifts evenly among eligible employees without violating any hard constraint.

A **planning policy** packages an objective with the constraints it needs. Multiple policies can participate in the same planning scenario; they are optimized jointly, not as independent rosters.

### Continuous fairness

For a given employee and shift category, RosterCore's fairness model compares:

- **Actual assignments:** cumulative work already assigned or completed.
- **Ideal share:** the employee's cumulative target under the selected participation policy.
- **Fairness balance:** ideal share minus actual assignments.

A balance is carried forward when planning continues. The engine lexicographically minimizes the configured prefix and final debt metrics without resetting balances at calendar boundaries.

Participation policies include equal shares, availability-weighted shares, and configurable positive integer weights. The exact meaning of fairness remains an explicit policy choice: employee availability, eligibility, and business constraints can prevent a perfectly equal result.

**The engine will not optimize an infinite future.** It uses a *rolling horizon*, keeping historical information while solving a finite, configurable interval at a time.

## Technology

| Layer | Technology |
| --- | --- |
| Core engine | C++20 |
| Optimization backend | [Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver) |
| Build system | CMake |
| Public configuration | Versioned JSON + JSON Schema |
| Initial integration | Native command-line executable |
| Local playground | React, TypeScript, Vite |
| Optional local adapter | Node.js |
| Target platforms | Windows, macOS, Linux |

The solver is isolated behind an adapter so that domain rules and public schemas are not tied to a particular optimization library.

## Configuration and integrations

RosterCore offers three equivalent ways to define scheduling rules:

1. **Programmatic:** create or update JSON configuration documents.
2. **Visual:** build the same configuration with a guided editor, including nested logical constraints.
3. **AI-assisted:** provide a machine-readable scenario context and an authoring guide to an AI assistant, then import the generated policy after validation and review.

AI-generated input is treated as **untrusted configuration**, not executable code. A generated policy must pass schema validation, reference checks, and semantic validation before it can become active.

HR software remains external to the optimization core. An adapter or host application can synchronize leave and availability records through a documented JSON contract; published or historical assignments must not be silently rewritten.

## Getting started

Requirements: C++20 compiler, CMake 3.24+, Python 3.12+ (dependency bootstrap/tests), Node.js 22+ (playground), and network access for initial dependency downloads. The supplied Linux binary dependency targets Ubuntu 24.04/glibc 2.39 or newer. Use `--source` on older distributions; Windows and macOS automatically build OR-Tools from source.

```sh
python3 scripts/bootstrap.py
cmake --preset dev
cmake --build --preset dev
ctest --preset dev
build/rostercore solve examples/pharmacy.json > result.json
build/rostercore verify examples/pharmacy.json result.json
cd playground
npm ci
npm run dev
```

Open **http://127.0.0.1:4317**. The reference example is loaded automatically: five employees, fourteen closing duties, exact continuous fairness. Generate a schedule, inspect coverage and debts, edit policies visually, or create an empty scenario. Use **Load evolving pharmacy example** to try part-time hours, two closing duties, fallback, nights, dated hires/departures and closures, or **Load automatic week example** for solver-selected weeks. Follow the numbered editors, preview workforce hours and weekly classification, then generate, import leave and regenerate from its effective date. Inputs are kept in browser storage; export JSON for a portable backup. The **Language / Lingua** selector in the top bar switches between English and Italian and remembers the choice in this browser. Navigation, editors, results, dates, numbers and known diagnostics are localized; original diagnostic codes/details remain available. Switching language preserves scenario data, custom labels and JSON exports.

For a production UI build on the same local adapter, run `npm run build && npm start`. This still binds only to loopback. `ROSTERCORE_CLI` can select a different native executable; `PORT` changes the local port. No AI, cloud or HR account is required.

On Windows use a Developer PowerShell with Visual Studio 2022 C++ tools:

```powershell
python scripts/bootstrap.py
cmake -S . -B build -DCMAKE_PREFIX_PATH="$PWD/.deps/ortools" -DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON="$PWD/.deps/json" -DFETCHCONTENT_SOURCE_DIR_JSON_SCHEMA="$PWD/.deps/json-schema-validator"
cmake --build build --config Release --parallel 2
ctest --test-dir build -C Release --output-on-failure
.\build\Release\rostercore.exe solve examples/pharmacy.json
```

On macOS install Xcode command-line tools and CMake, run `python3 scripts/bootstrap.py --source`, then use the Unix commands above. Source dependency builds may take several minutes. A host-provided OR-Tools installation can be supplied through CMAKE_PREFIX_PATH; `ROSTERCORE_SCHEMA_DIR` overrides the runtime schema directory.

## Imports and integration

```sh
# Preview, then explicitly apply one complete policy:
build/rostercore import-policy examples/pharmacy.json examples/policy-create.json
build/rostercore import-policy examples/pharmacy.json examples/policy-create.json --apply
# Import approved leave without changing protected assignments:
build/rostercore sync-hr examples/pharmacy.json examples/hr-events.json --apply
```

Commands return JSON; imports return the updated scenario without overwriting the original. See [API and integration examples](docs/API.md). AI authors should read [AI_POLICY_AUTHORING_GUIDE.md](AI_POLICY_AUTHORING_GUIDE.md) and use [the policy schema](schemas/planning-policy.schema.json). The playground exports a privacy-conscious AI context and requires preview/confirmation before applying an import.

## Validation, benchmarks and packaging

```sh
ctest --preset dev
python3 scripts/benchmark.py build/rostercore
cd playground
npm run build
npx playwright install chromium
npm run test:server
npm run test:e2e
```

If Chrome is already installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses it instead of a downloaded browser. See [test report](docs/TEST_REPORT.md) and [measured benchmark data](docs/benchmark-results.json). Larger cases can exhaust their budget; FEASIBLE and UNKNOWN are reported honestly.

`cmake --install build --prefix /your/install/path` installs the CLI, runtime libraries, headers, schemas and notices. `cpack --config build/CPackConfig.cmake -G TGZ` builds a native archive on Unix. Keep dependency license notices with redistributed binaries. [CI](.github/workflows/ci.yml) builds/tests Linux, Windows and macOS; the focused Windows loader repair passed all three platforms; see the test report for release-specific evidence.

## Four implementation phases

| Phase | Delivered |
| --- | --- |
| 1. Foundations | C++20/CMake, domain, strict JSON Schema/semantic validation and CLI |
| 2. Optimization | CP-SAT, nested logic, cumulative exact fairness, rolling history and independent verifier |
| 3. Integrations | Atomic policy import, AI guide/drafts/mapping, history rebuild and HR revision/snapshot protocol |
| 4. Playground & distribution | Visual configurator, results/comparison, local API, tests, measured benchmarks and cross-platform CI |

[Requirements](docs/SPECIFICATION.md) · [phase record](docs/PROGRESS.md) · [agent instructions](AGENTS.md)

## Design priorities

- **Correctness before convenience:** no silent relaxation of hard constraints.
- **Explainability:** distinguish invalid input, infeasible models, feasible schedules, and proven optimal solutions.
- **Deterministic contracts:** stable identifiers, versioned schemas, and explicit update semantics.
- **Modularity:** keep the optimization core independent of the UI, HR providers, and AI services.
- **Efficient modeling:** rely on established solvers and benchmark realistic workloads.
- **Privacy by design:** minimize personal data in exported contexts and avoid implicit external transmission.
- **Extensibility without overgeneralization:** focus on workforce scheduling rather than trying to solve every resource-allocation problem.

## Contributing

Contributions, bug reports, benchmark scenarios, and design feedback are welcome. In particular, real-world scheduling edge cases and mathematically checkable test cases are valuable.

Please open an issue before starting a large architectural change. Use the commands above for development setup and keep schemas, examples and tests synchronized.

## License

RosterCore's original code and documentation are released under **[Apache License 2.0](LICENSE)**. See [third-party notices](docs/THIRD_PARTY_NOTICES.md) for dependency and AGENTS template attribution.

Third-party dependencies retain their own licenses. In particular, Google OR-Tools is distributed under **Apache License 2.0**; redistributions that include dependencies must comply with their applicable license and notice requirements.

## Disclaimer

Workforce scheduling may be subject to labor laws, collective agreements, local regulations, and organization-specific policies. RosterCore is intended to enforce **explicitly modeled constraints**; using it does not by itself establish legal or contractual compliance.
