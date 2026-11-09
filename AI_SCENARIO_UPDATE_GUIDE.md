# Typed scenario updates · RosterCore 0.4

Return one `rostercore.scenario-change-set` document, schemaVersion 1, conforming to `schemas/scenario-change-set.schema.json`. No JSON pointers, arbitrary merge, scripts or executable expressions are accepted. The operation list in `AI_CAPABILITIES.json` is generated from the schema. Full scenario authoring and semantics are documented in `AI_SCENARIO_AUTHORING_GUIDE.md`.

## Envelope

| Field | Rule |
| --- | --- |
| id | New stable idempotency ID for this exact change set. |
| scenarioId | Exact target scenario ID from the context. |
| expectedRevision | Exact current scenario revision. |
| expectedConfigurationHash | Optional exact current hash from the native context. |
| allowHardRuleChanges | Required explicit boolean; true only for a user-authorized definition/calendar/hard-rule change. The UI also requires explicit local authorization. |
| referenceDate | Optional explicit date resolving “today”; state the year and intended effective dates in operations. |
| description | Optional human-readable intent; not executable behavior. |
| operations | 1–200 typed operations applied in order to a private copy, validated together and committed atomically. |

The same ID with the same canonical contents replays as a no-op even after the scenario revision advances. Reusing an ID for different contents fails. A changed scenario revision/hash or entity hash fails without applying any earlier operation. Successful non-repeated application increments scenario revision once and stores an appliedChangeSets receipt. Preview returns the candidate and before/after revision, protected-state preservation and affected regeneration start; it does not mutate the workspace. Any edit after preview invalidates confirmation.

## Operations

| Operation | Required payload / behavior |
| --- | --- |
| CREATE_EMPLOYEE | value: complete employee. Duplicate IDs fail. Preserve historical identities; new hires use employment.validFrom. |
| UPDATE_EMPLOYEE | employeeId, effectiveFrom, patch with only typeId, workPatternId (ID/null), attributes. Missing fields remain untouched. Attribute keys merge into the active dated version, without discarding other attributes. Splits that version at the effective date, preserves its end and later versions. Starting the same date replaces that version deterministically. |
| RENAME_EMPLOYEE | employeeId, label; display-only rename. |
| END_EMPLOYMENT | employeeId, effectiveFrom; exclusive employment end, retains employee/history. |
| CREATE_* | value: complete typed entity. No implicit upsert. |
| REPLACE_* | value with same ID and expectedEntityHash; replaces that one complete entity. Obtain hash from native context.entityHashes. Policy revision must increase exactly once. |
| DELETE_* | id and expectedEntityHash; removal fails if final references/protected records become invalid. |
| SET_WEEK_CONFIGURATION | value: complete typed week configuration, preserving historical week locks. |
| SET_CALENDAR | value: complete typed calendar; preserve actual/publication continuity. |
| SET_CLOSURES | value: typed closure array, effective end exclusive. |
| SET_BASE_CONSTRAINTS | value: list of active constraint IDs. |
| SET_SEARCH | value: complete search settings; does not authorize hard-rule changes. |
| SYNC_HR | value: schema-4 rostercore.hr-events envelope, events and optional source snapshot. Uses the same revision/tombstone/protection rules as sync-hr. |

CREATE/REPLACE/DELETE suffixes: EMPLOYEE_TYPE, ATTRIBUTE, GROUP, SHIFT, WORK_PATTERN, PATTERN_RULE, WEEK_PROFILE, AVAILABILITY, ALLOWED_SHIFTS, CONSTRAINT, CONSTRAINT_SET, POLICY, COVERAGE, TEMPORAL_RULE, SPACING_RULE. Every value uses the scenario entity schema, with strict unknown-field rejection. Replacements are whole **single entities**, not whole scenarios; unspecified root collections are unchanged. Use UPDATE_EMPLOYEE for a partial personal change, never a replacement employee object.

Calendar, definition, rule and fairness modifications require allowHardRuleChanges true. Explicit operational personnel/availability/HR/search actions do not require that blanket flag; they still cannot rewrite protected work. Unknown IDs, invalid references, overlapping versions, missing eligibility context, unsupported operators and incompatible protected assignments reject the entire transaction. Dated personal changes must start after the confirmed actual-history watermark. Backdated corrections require an explicit historical reconciliation outside this update path.

The preview shows the candidate's changed entities; review removals as well as additions. Archives are separate immutable contextual records. Updating configuration never silently publishes, completes, supersedes, clears actual history or regenerates a saved calendar. After application, explicitly regenerate affected future dates. If published work conflicts, first create a revision proposal from the official saved calendar, then apply the update to that proposal. The original remains official until the replacement is explicitly published.

## Concrete requests

All seven JSON documents in `AI_EXAMPLES/` are automatically tested. They use fictional people and explicit years:

1. Full five-person business, two WORKING shifts, one exact daily closing.
2. Anna → PART_TIME from **2027-03-01**, preserving name, manager attribute, role and future versions.
3. Giuseppe vacation **2027-08-10 through 2027-08-17 inclusive**.
4. Marco absent “today for three days,” with referenceDate **2026-11-09**, inclusive end **2026-11-11**; regenerate afterwards.
5. New evening shift **16:00–21:00**; creating its definition does not implicitly add a coverage requirement.
6. Manager physically present on special-week Sundays **09:00–12:00**; uses PRESENCE and typed manager predicate.
7. New eligible colleague from **2026-11-16**, dynamic eligibility selector and policy revision preserving objective identity/definition and historical snapshots.

Each update targets the original example's revision 1 independently. Do not apply the seven as an ordered migration sequence. For a real workspace, regenerate the envelope and entity hashes from its actual context. A new fairness definition or changed tag membership may require dated historical-context rebuilding; never fabricate weights or reset debt. Provide original eligibility context for every actual date and preview `rebuild-history` before applying. Old category membership without a recorded snapshot must be reviewed from original archives.

## Full scenario import and commands

`rostercore import-scenario CURRENT REQUEST [--apply]`, where REQUEST has candidate, expectedRevision, mode NEW_SCENARIO/REPLACE_CURRENT and allowHardRuleChanges. New mode requires a distinct scenario ID. Same-ID replacement preserves history, locks, receipts and archive links exactly and requires explicit hard-rule authorization. Validation preview precedes application in the panel.

`rostercore change-set CURRENT CHANGE_SET [--apply]` uses this contract directly; without --apply it only previews. `rostercore context CURRENT` exports revision, configuration hash, stable catalogs and per-entity replacement hashes. The default web AI package excludes employee display names, leave records, actual assignments and unused attributes. Full personal scenario export requires an explicit checkbox. Custom labels and business information still require user review before sharing with an external assistant.
