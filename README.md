# RosterCore

**Open-source workforce scheduling powered by constraint optimization and continuous fairness.**

RosterCore generates workforce schedules from declarative rules using a C++20 engine and Google OR-Tools CP-SAT, with a bilingual desktop application and **fairness that carries over across planning periods**.

Designed for integration into desktop applications and backend services, RosterCore aims to remain independent of any specific industry. Pharmacies are the initial reference use case, but the model is intended for healthcare, retail, hospitality, manufacturing, and other shift-based workplaces.

**Version 0.7.0** asks where to work on first launch. Create a local workspace at the suggested path or choose another file, open an existing workspace, connect to a shared one, or try the isolated demo. RosterCore remembers the last local workspace. The persistent navigation provides **Calendar**, **People**, **Configuration** and **Archive** in English and Italian.

Choose **Import a file** to review a configuration, a typed change, a saved calendar or a workspace backup. A successful import opens the calendar. Restoring a backup into a populated workspace requires confirmation because it replaces the current data.

From **Configuration**, describe the planning rules, copy or download the AI package, and import the JSON reply. Review the native validation and proposed changes before saving. Use a complete scenario for a new workspace and a revisioned, typed change set for updates. AI assistance works with a provider of your choice, without an account or key in RosterCore. See the [scenario guide](AI_SCENARIO_AUTHORING_GUIDE.md), [update guide](AI_SCENARIO_UPDATE_GUIDE.md) and [examples](AI_EXAMPLES/).

## Why RosterCore?

A valid roster is not necessarily a good roster. A scheduling engine should satisfy staffing and availability requirements **and** distribute recurring duties fairly over time.

A common approach balances assignments within a fixed week or month. That boundary can be arbitrary: fairness may require three weeks and two days, for example, and a monthly reset can erase an imbalance that has not yet been corrected.

RosterCore implements **continuous, history-aware fairness**: it will optimize finite planning windows while preserving the effects of previously completed assignments.

## Implemented capabilities

- **Automatic work-pattern assignments:** dated attribute/group selectors, explicit manual precedence, conflict diagnostics and core-backed previews.
- **Dated workforce:** typed/default attributes, predicates, employment changes, reusable work patterns and logical shift variants.
- **Weekly calendars:** manual/recurring/solver-selected ISO profiles, hard/desired frequencies, versioned Italian holidays and company closures.
- **Operational coverage:** actual interval presence, distinct qualified responsibilities, lexicographic fallback resources and cross-day/rest rules.
- **Composable hard constraints:** exact/minimum/maximum staffing counts, allowed shifts, exclusions, and nested `AND`/`OR` expressions.
- **Reusable planning policies:** a named objective together with its associated constraints and references to shared rules.
- **Continuous fairness:** cumulative assignment counts, ideal shares, historical balances, and optimization across rolling planning horizons.
- **Multiple objectives:** explicit priorities and lexicographic optimization, rather than arbitrary blending of unrelated goals.
- **Portable integration:** a native C++ engine with a versioned JSON interface and a command-line entry point.
- **AI-assisted authoring:** documented, schema-validated policy files that can be drafted by an AI assistant and reviewed before import.
- **Desktop workflow:** calendar generation, roster changes, exports, SQLite workspaces and shared LAN operation.
- **HR interoperability:** vendor-neutral JSON exchange for approved leave, absences, updates, and cancellations.
- **Transparent results:** solver status, validation errors, fairness metrics, and reproducibility metadata.

See [public contracts and commands](docs/API.md), [architecture and semantics](docs/ARCHITECTURE.md), and [test evidence](docs/TEST_REPORT.md).

## Daily calendar and exports

Generate, modify, export and publish from **Calendar**. Open **More calendar actions** to inspect the native diagnostics, detailed fairness results and independent verification.

**Export calendar** is available on the current calendar and every saved archive. Choose people, dated roles/groups, an inclusive period, working shifts and independent availability/rest/holiday filters. Hide normal work explicitly without changing assignments. PDF offers A4/A3, compact or actual-hour cells, weekly/monthly grids or person lists, repeated headings and a matching pagination preview. ICS offers collective or private personal files (ZIP for several people), with separate events for split intervals. CSV uses the same native view. Full JSON always saves the complete original canonical archive, including people outside the current filter.

**Modify planning** supports reviewed absence, closure, future-hour, colleague, contract and pattern changes, followed by future regeneration. A protected published period requires an explicit revision proposal. Publication protects plans; **Record work performed** separately requires a past/current actual-work prefix and confirmation. **Archive** holds saved calendars, configuration revisions, backups and historical continuity tools.

**Ask AI for help** prepares a local, scoped request to copy or download for an assistant of your choice. Import its typed answer, read the human description and explicitly confirm it. No external AI service is called. See [export semantics and limitations](docs/EXPORT_USABILITY.md).

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
| Desktop interface | Electron, React, TypeScript, Vite |
| Persistence and API | SQLite and Node.js |
| Desktop targets | Windows x64, Linux x64 |
| Native CLI targets | Windows, macOS, Linux |

The solver is isolated behind an adapter so that domain rules and public schemas are not tied to a particular optimization library.

## Configuration and integrations

Use the native JSON contracts to define rules programmatically or with AI assistance. Complex selectors, patterns and hard rules remain available through schema-validated JSON. Everyday workforce changes, leave and absences are available in **People**. Imported configuration is validated by the native engine and requires review before saving.

HR software remains external to the optimization core. An adapter or host application can synchronize leave and availability records through a documented JSON contract; published or historical assignments must not be silently rewritten.

## Install and use

The CI packages target Windows 11 x64 and Ubuntu 24.04 LTS x64 or newer. Windows offers a portable `.exe` and an NSIS installer. On Linux, make the AppImage executable and launch it, or install the DEB with `sudo apt install ./rostercore_0.7.0_amd64.deb`. The AppImage requires FUSE or its extract-and-run mode. The desktop packages include the UI, Node/Electron and native engine. Package availability and checks are recorded with the CI artifacts.

Open **Workspace and backups** from Archive to change workspace, save a local database backup or restore it into a new file. The portable app's file picker starts next to its executable when available. The default workspace lives in the application data directory. An earlier browser workspace can be recovered explicitly from the original browser profile and origin, or moved using its JSON workspace backup. Print profiles and language remain preferences. The native 8 MiB JSON input limit also bounds combined archive operations and imports.

### Share a workspace on the LAN

Set these environment variables on the machine that owns the database. Use a local disk and a private IPv4 address assigned to that machine.

| Variable | Value |
| --- | --- |
| `ROSTERCORE_WORKSPACE` | Absolute path to the host's SQLite file |
| `ROSTERCORE_LISTEN` | Private IPv4 bind address |
| `ROSTERCORE_TLS_PORT` | HTTPS port, default 4319 |
| `ROSTERCORE_TOKEN` | Random shared token of at least 16 characters |
| `ROSTERCORE_TLS_KEY` | Absolute path to the server's PEM private key |
| `ROSTERCORE_TLS_CERT` | Absolute path to the server's PEM certificate or chain |

With those variables set, launch the desktop app to host with a GUI. Run `node playground/server.mjs --headless` in a source checkout, or run `rostercore-host` or `rostercore-host.cmd` next to an installed desktop executable for headless hosting. For an AppImage, the host launcher is available in the extracted package. Use the host's interface or the client JSON export to back up an active shared workspace.

On each client, choose **Connect to a shared workspace** in **Archive** or on the welcome screen. Enter the HTTPS URL and token. For a private CA or self-signed certificate, paste the trust certificate in PEM format. The certificate must identify the address entered by the client, such as an IP in its Subject Alternative Name. Keep shared workspace files on the host's local disk and use HTTPS for collaboration. On a conflict, reload and review the pending change again.

## Build from source

Install a C++20 compiler, CMake 3.24+, Python 3.12+ and Node.js 22.16+ (within the Node 22 LTS line, install a current patch version).

```sh
python3 scripts/bootstrap.py
cmake --preset dev
cmake --build --preset dev
ctest --preset dev
cd playground
npm ci
npm run build
npm run desktop
```

Use `npm run dev` for the same interface at **http://127.0.0.1:4317**. Use `npm run package:desktop` after the native and UI builds to produce packages in `build/desktop`. Linux packages built locally may require the builder's newer glibc. The supplied OR-Tools binary dependency targets Ubuntu 24.04/glibc 2.39. Build it from source with `--source` on other Linux distributions.

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

Commands return JSON; imports return the updated scenario without overwriting the original. See [API and integration examples](docs/API.md). AI authors should read [AI_POLICY_AUTHORING_GUIDE.md](AI_POLICY_AUTHORING_GUIDE.md) and use [the policy schema](schemas/planning-policy.schema.json). The desktop application exports a compact AI context and requires review before applying an import.

## Validation, benchmarks and packaging

```sh
ctest --preset dev
python3 scripts/benchmark.py build/rostercore
cd playground
npm run build
npx playwright install chromium
npm run test:server
npm run test:e2e
npm run test:exports
```

If Chrome is already installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses it instead of a downloaded browser. See [test report](docs/TEST_REPORT.md) and [measured benchmark data](docs/benchmark-results.json). Larger cases can exhaust their budget; FEASIBLE and UNKNOWN are reported honestly.

`cmake --install build --prefix /your/install/path` installs the CLI, runtime libraries, headers, schemas and notices. `cpack --config build/CPackConfig.cmake -G TGZ` builds a native archive on Unix. Keep dependency license notices with redistributed binaries. [CI](.github/workflows/ci.yml) builds/tests Linux, Windows and macOS; release-specific native validation is linked in the test report.

## Four implementation phases

| Phase | Delivered |
| --- | --- |
| 1. Foundations | C++20/CMake, domain, strict JSON Schema/semantic validation and CLI |
| 2. Optimization | CP-SAT, nested logic, cumulative exact fairness, rolling history and independent verifier |
| 3. Integrations | Atomic policy import, AI guide/drafts/mapping, history rebuild and HR revision/snapshot protocol |
| 4. User application & distribution | Calendar operations, AI configuration, persistent and shared workspaces, tests and native desktop packaging |

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
