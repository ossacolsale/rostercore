# Complete scenario authoring · RosterCore 0.4

Produce data, never executable code. Return a single `rostercore.scenario` JSON document. Use `schemaVersion: 4`; older versions 1–3 remain readable. `schemas/scenario.schema.json` is authoritative: unknown properties are rejected. `AI_CAPABILITIES.json` enumerates supported exchange documents and operations. `AI_EXAMPLES/01-create-scenario.json` is an executable complete example with five fictional employees, two WORKING shift types, daily closing coverage and continuous fairness. The structural OFF shift is separate from those two working types.

For an existing scenario, prefer a typed change set: follow `AI_SCENARIO_UPDATE_GUIDE.md`. Do not regenerate the entire configuration to change one field. Preserve stable IDs, actual history, publication locks and receipts. Never invent a record of completed work.

## Entity and dependency map

| Collection | Purpose / dependencies |
| --- | --- |
| `employeeTypes` | Stable role IDs and display labels. No role has built-in industry behavior. |
| `attributeDefinitions` | STRING, BOOLEAN, NUMBER, INTEGER or ENUM, optional default/effective interval. ENUM requires values. Explicit false differs from missing; null suppresses a default. |
| `employees` | ID, label, typeId and explicit attributes; optional employment, base workPatternId and dated versions. Unspecified fields retain their base value. Version attributes overlay the base; versions do not implicitly accumulate earlier expired versions. |
| `groups` | Named reusable selector; references roles, people, attributes or other groups. Cycles fail. |
| `shifts` | Logical WORKING/OFF assignment. WORKING needs positive intervals or applicable variants; OFF has no intervals. Optional `fairnessTags` reuse a shared burden category across objectives and spacing. |
| `workPatterns` | Dated versions, working weekdays, permitted shiftIds, optional weekdayShifts overrides and exact-date exceptions. Outside working weekdays only permitted OFF shifts remain. Date exceptions override weekday limits. |
| `workPatternAssignmentRules` | Enabled dated selector → pattern. Greatest numeric priority wins; conflicting equal priorities fail. Individual/base assignments take precedence; a dated null pattern explicitly returns to automatic selection. No match preserves legacy unrestricted behavior. |
| `shifts[].variants` | Selector/scope/pattern-sensitive concrete hours. Greatest numeric priority wins; ambiguous ties fail. Once variants exist, no matching variant means the shift is unavailable. Supply a general default variant if appropriate. |
| `weekProfiles` | Rest weekdays, holidayMode NORMAL/OFF, optional permitted shifts and linked constraints/policies. A profile is not an employee contract. |
| `weekConfiguration` | One main profile per ISO week. Historical locks, authorized manual exceptions, dated recurrences, automatic candidates, then default. Manual overrides need a reason and do not shift the recurrence. |
| `calendar` | Inclusive planning dates, timezone label, excluded dates/ranges/ISO weeks, optional offline national/local holidays and business closures. Exclusion removes planning; profile rest creates OFF assignments. |
| `availability` | ABSENT selector over an inclusive scope. All-day absence only. HR events are an alternative revisioned integration, not a second source to duplicate manually. |
| `allowedShifts` | Intersect permitted shift sets for matching employees/dates. Empty intersections are infeasible. `allowRequiredRest` permits only rest justified by an explicit qualifying succession. |
| `dutyRequirements` | RESPONSIBILITY or interval PRESENCE, shiftIds, qualified preference levels, EQ/GE/LE count, required intervals, scope. Preference level 0 is ordinary; greater levels are fallback. Smaller preferencePriority is optimized first, worst fallback tier first. |
| `temporalRules` | SUCCESSION, FORBIDDEN_PAIR or MIN_REST, selector, source/target shifts, offset and scope. Hard constraints, including across known historical/published boundaries. |
| `constraints`, `baseConstraintIds`, `constraintSets` | Optional COUNT/AND/OR/REMAINING AST for advanced Boolean coverage. Definitions are activated explicitly. |
| `policies` | Stable revisioned fairness objective plus owned/shared constraints, duty requirements and temporal rules. Active, non-draft policies participate. Scoped profiles may activate them. See the policy guide. |
| `spacingRules` | Shared shift IDs/tags, selector/scope, HARD/SOFT, CALENDAR/NORMAL_WORK_DAYS, minimumGap, explicit normalShiftIds, CLOSE_PAIRS/GAP_DEFICIT and priority. |
| `history` | Confirmed actual assignments, dated participation snapshots and optional through watermark, all strictly before the horizon. Preserve exact rational accounting. |
| `publishedAssignments` | Protected planned assignments, including concrete intervals/profile. Publication is not actual work and earns no historical quota. |
| `hrState` | Revisioned HR event/tombstone state and source snapshot revisions. Preserve when updating. |
| `archiveState`, `proposal`, `appliedChangeSets` | Core-managed lifecycle links, explicit future revision and idempotent import receipts. Do not manufacture them. |
| `search` | maxTimeSeconds 0–600, seed, workers 1–32, deterministic flag. Timeout is FEASIBLE with a verified incumbent or UNKNOWN without one, never a proof of optimality. |

Required root fields and all nested required fields are in the supplied schema. Empty collections are arrays, not null. An example is a better starting point than guessing defaults. A new scenario needs a new stable ID and revision 1. Labels are display text, never domain keys. IDs are not translated when the interface language changes.

## Time and scope

Dates are Gregorian `YYYY-MM-DD` within 1900–2200. Scenario ranges and `scope.start/end` are inclusive. Employment, work-pattern versions, employee versions, closures and other effective intervals use **[validFrom, validTo)**. Thus leave through 17 August uses scope.end 17 August, whereas a business reopening on 18 August uses validTo 18 August. Weekdays are ISO 1 Monday through 7 Sunday. Recurrence and automatic effective boundaries are ISO Mondays. Supply `referenceDate` in a change set when interpreting “today”; never rely on an assistant's clock or infer a year for ambiguous dates.

Intervals use local HH:MM, explicit endDayOffset 0/1 and optional startFold/endFold 0/1 for ambiguous DST. Split shifts use multiple nonoverlapping intervals. An overnight assignment occupies the next date too: absence/closure and minimum rest check actual occupied time. Elapsed MIN_REST supports UTC and the embedded Europe/Rome transitions only; unsupported zones are rejected. National Italian holiday data are versioned and local exceptions are explicit. “Open on national holidays” means profile NORMAL; OFF allows scheduled rest only. A holiday label alone never turns an absence, closure or OFF into normal work.

Scope fields combine conjunctively: date range, weekdays, exclusions, dayType and weekProfileIds. A profile and a policy scope also intersect. Empty selector means everyone; an empty explicit typeIds/employeeIds selection selects nobody. See selector schema for field combination rules. Attribute conditions support typed comparisons, membership, EXISTS, AND/OR/NOT; constraint AST supports COUNT/AND/OR/REMAINING, not general NOT/IMPLIES.

## Required coverage before preferences

For a daily closing, use RESPONSIBILITY, EQ count, bindAssignments true and a shared exclusiveGroup for duties that must use different people. Required intervals describe the actual duty, which must fit the person's dated variant. `dutyBindingMode: GLOBAL` prevents a shift attached to a bound responsibility from being assigned without a qualified responsibility, even outside its coverage scope. New simple scenarios use GLOBAL. The default ACTIVE_SCOPE preserves older models and binds only when a matching duty is active. If the same logical shift is also ordinary unbound work, model that distinction explicitly or retain ACTIVE_SCOPE intentionally.

PRESENCE checks every interval segment, and may combine different people across segments. A person can serve multiple requirements unless exclusiveGroup prevents it for responsibility witnesses. Qualification/fallback selectors do not create extra workers or change hard availability. `GE` is a lower bound, `EQ` is exact. Do not add redundant minimization of duty count when exact coverage plus binding already fixes it.

## Fairness and spacing

Fairness counts assignments, using exact rational cumulative ideal-minus-actual debt at every included prefix. Targets are the **union** of shiftIds and matching fairnessTags; one assignment is counted once per objective. Aggregate and per-type objectives maintain separate debts; do not add them together as another burden total. AVAILABILITY_WEIGHTED uses actual dated eligibility, including patterns and variants. A part-time worker eligible only Friday earns no opportunity share on other days. EQUAL intentionally ignores that eligibility distinction; CUSTOM_WEIGHTED requires explicit positive per-person weights.

Use combined category fairness before separate shift fairness by default, then soft spacing. Lower numeric objective/spacing priority comes first; metrics within a policy retain their declared order. Each proved optimum is fixed before the next solve. All hard rules and fallback priorities precede these objectives. No arbitrary weighted tradeoff can improve fairness by worsening a proved fallback minimum.

CALENDAR minimumGap is the difference in assignment dates: 2 forbids consecutive dates. NORMAL_WORK_DAYS minimumGap is the number of actual intervening assignments to the explicit normal WORKING shifts: 1 requires one such assignment. Normal IDs must be disjoint from the burden category. Absence, OFF and closure never count. CLOSE_PAIRS counts all burden pairs below the threshold; GAP_DEFICIT sums their shortfall. Only second assignments inside the rule's current scoped horizon contribute; known earlier assignments supply boundary context even if their profile differs. Historical facts and published plans remain distinct for fairness accounting. Soft spacing may remain imperfect because higher priorities are fixed or search is unfinished; do not invent a causal explanation.

Keep actual ledger history across horizons. Changing an objective definition requires explicit dated snapshot rebuilding. Schema-4 tag snapshots additionally retain sorted targetShiftIds and reject changed category membership. Legacy snapshots do not contain that membership evidence: retain their original context and rebuild explicitly when changing categories. The core cannot reconstruct absent historical eligibility.

## Exchange, validation and limits

Preview and explicitly confirm imports. Full replacement of the same scenario must preserve actual history, publication locks and receipts exactly, and requires explicit hard-rule authorization. Use a saved calendar revision proposal to free only future assignments before a conflicting change. New-scenario import preserves the existing archive library. Native commands: validate, solve, verify, verify-quality, improve, change-set, import-scenario, archives, regenerate, context, import-policy, sync-hr and rebuild-history; see README for arguments.

Feasibility verification is separate from fallback quality verification. Positive substitutes in a FEASIBLE calendar are provisional until their minimum is proved. `verify-quality` performs independent counterfactual solves against hard rules and earlier fallback optima, without trusting imported phase claims. Improvement restarts with verified assignment hints; it is not a serialized continuation of CP-SAT internals.

Limits include 8 MiB per JSON input, 80 nesting levels, three years per horizon, exact-arithmetic caps, 100 spacing rules and two million candidate pairs per spacing rule. Numeric archive hashes normalize integral floats for JavaScript round trips and reject unsafe integer magnitudes. There is no arbitrary executable plugin, generic JSON Pointer patch, minute-based fairness, burden-points objective, partial-day absence, inferred labor law, automatic hard-rule relaxation, mandatory remote AI service or multi-user database.

Common errors: replacing all attributes to change one contract; treating a future publication as completed history; using a new employee ID for the same person; omitting a variant default; ambiguous equal rule priorities; adding a new objective without old participation context; interpreting a calendar gap as actual normal work; making a night shift end on the same day; expecting GE to fix an exact duty count; using an unsupported operator. Fix the declaration, never weaken validation to make an example pass.
