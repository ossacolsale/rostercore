# Changelog

## 0.7.0 — 2026-11-24

- Desktop app for Windows 11 x64 and Ubuntu 24.04 LTS x64 or newer. Use the Windows installer or portable executable. On Linux, install the DEB with `sudo apt install ./rostercore_0.7.0_amd64.deb`, or make the AppImage executable and launch it. The AppImage supports extract-and-run on systems without FUSE.
- Create and review AI-assisted configurations with the assistant of your choice. A single import flow supports existing configurations, change sets, backups and saved calendars.
- SQLite stores local workspaces, revisions and calendar history. Teams can share a host-owned workspace over authenticated HTTPS on a private LAN.
- Redesigned bilingual workspace selection, persistent navigation, calendar, dialogs and print controls. Backup recovery returns directly to the calendar.
- Leave and absences share the unavailability state in the calendar. Native archive operations retain the 8 MiB JSON input limit.

## 0.6.0 — 2026-11-24

- Replace the dual-mode playground with four bilingual desktop sections and an isolated demo.
- Add reviewed initial AI/JSON configuration and compact AI packages for typed updates.
- Save contextual archives, configuration revisions and actual history in SQLite. Support SQLite backups, older JSON backups and explicit browser recovery.
- Share a host-owned workspace over authenticated HTTPS with optimistic concurrency and atomic saves.
- Package the Electron desktop and native engine as Windows portable/NSIS and Linux AppImage/DEB targets.

## 0.3.0 — 2026-11-08

- Centralize viewport-bottom operation notifications with translated outcomes, persistent errors, deduplication/queueing, keyboard-accessible full diagnostics and safe mobile spacing. Distinguish infeasible/unknown/invalid outcomes from successful HTTP transport.
- Reorder guided configuration around logical shifts → work patterns/rules → concrete variants, with local progress/dependency states and free previous/next navigation.
- Add schema-3 dynamic work-pattern assignment rules using existing typed selectors, dated/default attributes, priority/conflict checks, manual/base precedence and explicit temporal return to automatic mode. Preserve old scenarios and individual assignments through explicit migration.
- Add visual rule/override editors, core-resolved origins/matching previews, variant applicability, reviewed bulk changes and guarded catalogue deletion. Retain saved unfinished drafts on reload.
- Add a complete automatic-assignment example, native/browser regression coverage and updated English/Italian authoring/API documentation.

## 0.2.0 — 2026-11-08

- Add schema-2 week profiles/cycles and automatic hard/soft frequency optimization, versioned Italian holidays and closures.
- Add dated workforce, typed defaults/predicates, work patterns, concrete shift variants, physical coverage, qualified fallback and cross-day/DST-aware rest. Preserve cumulative fairness/history and expose partial regeneration with stability and diffs.
- Extend the bilingual visual playground with reusable catalogues, progressive editors, core-backed previews, undo, operational results and complete examples. Expand schemas, AI exchange and regression/benchmark evidence.
- Fix macOS framework install configuration and stage transitive Windows DLLs next to native executables. Add fail-fast CLI startup checks, explicit UTF-8 subprocess handling, early dependency caching and CI failure logs on every platform.

- Add an English / Italian playground selector with browser persistence, translated editors/results/help, localized dates/numbers and known error messages. Preserve scenario data, diagnostic codes and original technical details.

## 0.1.0 — 2026-11-08

First runnable RosterCore release for local evaluation: generic C++20/CP-SAT scheduling, versioned strict JSON CLI, nested constraints, exact continuous fairness and rolling history, independent verification, atomic policy/HR imports, AI authoring resources and a React/TypeScript visual playground. Includes acceptance/invariant/browser tests, measured benchmarks, installation packaging and Linux/Windows/macOS CI configuration. Original project license is Apache-2.0. See `docs/LIMITATIONS.md` for explicit scope boundaries.
