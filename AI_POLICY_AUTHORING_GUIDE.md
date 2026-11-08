# RosterCore AI policy authoring guide

Engine 0.1.0 · JSON Schema version 1 · no AI service is required by RosterCore.

Generate **one complete policy exchange document**, containing both an objective and its hard constraints. Never generate scripts, code, SQL, custom expressions or unknown JSON fields. The authoritative contracts are `schemas/planning-policy.schema.json`, `schemas/scenario.schema.json` and `schemas/operators.json`. The executable core validates all paths, including visual configuration.

## With a base configuration

Read the provided `rostercore.ai-context` or scenario. Reuse exact employee/type/group/shift/shared-constraint IDs. IDs never imply industry behavior. Do not invent missing references. Avoid including personal information in labels. Ask the user about genuinely ambiguous requirements before generating a policy.

1. Identify the participant selector. Fields are optional; an empty selector means all employees. IDs within one field are unioned, while employeeIds/typeIds/groupIds/attribute tests intersect. Group selectors may reference other acyclic groups. Attribute tests use scalar equality.
2. Identify the shift IDs being balanced as **one category**. Balancing closing and opening separately requires two policies; one objective containing both IDs balances their combined COUNT.
3. Translate staffing requirements into COUNT atoms with EQ, GE or LE and nonnegative integer count. Use OR for alternative valid branches and AND for simultaneous requirements. They may nest to depth 32 (10,000 AST nodes per scenario).
4. Use REMAINING only in a flat AND branch with COUNT siblings and exactly matching selector documents. Its allowed shifts are the explicit COUNT shifts in that branch plus its own shift. It does not change GE into EQ. Do not place it directly under OR, at the root, beside nested groups or beside a different selector. Rewrite as unambiguous flat alternatives or explain that the requested form is unsupported.
5. Choose fairness participation explicitly: EQUAL includes all selected people even during absence; AVAILABILITY_WEIGHTED distributes that day's produced duties among employees eligible for at least one target shift; CUSTOM_WEIGHTED distributes among all selected employees using mandatory positive integer weights keyed by employee ID. If no duty is produced, no quota accrues. No weekly/monthly/yearly resets occur.
6. Set objective type CUMULATIVE_FAIRNESS, mode CONTINUOUS_BALANCED and measure COUNT. Choose and order supported metrics. Lower numeric priority precedes higher; policy-ID lexical order breaks ties, then metric array order. Each metric is optimized separately after fixing proven earlier optima. Never promise earliest-possible recovery or infinite-horizon optimality.
7. Add optional date/day scopes to policy, objective and rules. Intersecting scopes all apply. Excluded objective dates do not receive quota increments; global exclusions create no assignments at all. Availability itself belongs to the base scenario, not a policy import.
8. Include all required fields and validate against the schema. CREATE requires a new policy ID and revision 1, without expectedRevision. REPLACE contains a complete policy with the same ID, expectedRevision equal to the current revision, and new revision = expectedRevision + 1. Do not describe a partial patch as REPLACE.

## Without a base configuration

Create an **inactive draft**: `draft:true`, `active:false`. Use symbolic dependency IDs beginning with `@`, declaring each in dependencies with kind employee/type/group/shift/constraint/constraintSet. Never claim the draft is runnable. The playground maps symbols to existing entities; users can explicitly create missing entities in visual editors. After resolving every dependency, set draft=false and active=true in the imported document. A dry-run still performs complete validation.

## Complete example

Use `examples/policy-create.json` with `examples/pharmacy.json`. It creates a second objective for regular duties, with its own staffing rule. `examples/policy-replace.json` replaces closing-fairness at expected revision 1. `examples/policy-draft.json` demonstrates dependency mapping; `examples/policy-invalid.json` must be rejected. All examples are checked by automated tests.

## Constraint grammar

See `docs/CONSTRAINT_GRAMMAR.md`. Operator names are uppercase:

```json
{"op":"COUNT","selector":{"typeIds":["staff"]},"shiftId":"closing","comparison":"EQ","count":1}
```

```json
{"op":"OR","children":[
  {"op":"AND","children":[
    {"op":"COUNT","selector":{"typeIds":["staff"]},"shiftId":"closing","comparison":"EQ","count":1},
    {"op":"COUNT","selector":{"typeIds":["staff"]},"shiftId":"regular","comparison":"GE","count":1},
    {"op":"REMAINING","selector":{"typeIds":["staff"]},"shiftId":"off"}
  ]},
  {"op":"COUNT","selector":{"typeIds":["staff"]},"shiftId":"closing","comparison":"EQ","count":2}
]}
```

An employee receives exactly one admissible shift each available day. Absent employees receive no ordinary assignment, including OFF. Shift restrictions intersect; an empty intersection is infeasible. Do not invent rest assignments to repair the input. Policy-local hard constraints and referenced shared constraints apply only while that policy is active. `baseConstraintIds` activates shared rules independently of policies.

## Fairness and history

Ideal shares depend on **actual produced target assignments**, not an invented fixed staffing total. Debt = ideal − actual. Metrics are MAX_ABSOLUTE_PREFIX_DEVIATION, SUM_ABSOLUTE_PREFIX_DEVIATIONS and FINAL_ABSOLUTE_DEVIATION (the sum of final absolute employee debts). Exact rational values appear as numerator/denominator objects. Historical assignments and dated participation snapshots carry continuity. A definition change affecting participation, selector, shifts or scope triggers history recalculation; never silently discard existing history or fabricate a new opening balance. Metric/priority/label changes alone do not change historical quotas.

## Refuse or clarify

Explain contradictory staffing counts, unresolved references, cyclic groups, impossible availability, missing custom weights, ambiguous REMAINING branches and unsupported requirements. Do not silently weaken hard rules. NOT, IMPLIES, hourly coverage, elapsed-minute fairness, burden scores, EARLIEST_BALANCE and operational partial-day absence are unsupported. Time intervals are local civil times with explicit midnight offsets; COUNT does not imply elapsed working-hour or DST guarantees. Do not invent labor-law compliance.

## Import workflow

Export context → draft externally → import → map dependencies → preview → confirm application → generate schedule. A preview never modifies configuration. A failed application returns no partial scenario. REPLACE touches exactly one policy and never alters shared rules or another policy. The core compares revisions and engine/schema versions again on application. Review `historyRecalculationRequired` before solving changed objectives against existing history. Use the explicit `rebuild-history` import with original dated scenario contexts when necessary; see `docs/API.md`.

## User prompt template

> Using this guide, the JSON Schemas and attached context, produce one complete rostercore.planning-policy document. My participants are [IDs or description], target duties [IDs], staffing requirements [counts and alternatives], applicability [dates/weekdays], participation [equal/availability/custom], metric order [supported metrics] and priority [integer]. Use CREATE for [new ID], or REPLACE for [existing ID, expected revision]. Ask about ambiguity and identify unsupported requests. Return a JSON file suitable for dry-run import. Do not invent references, silently relax constraints, reset historical debt or include executable code.
