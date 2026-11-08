# Constraint grammar · schema 1/2

```text
Selector   := { employeeIds?: ID[], typeIds?: ID[], groupIds?: ID[],
                attributes?: { key: string | number | boolean } }
Scope      := { start?: ISODate, end?: ISODate, weekdays?: (1..7)[],
                excludedDates?: ISODate[] }
Count      := { op: "COUNT", selector: Selector, shiftId: ID,
                comparison: "EQ" | "GE" | "LE", count: integer >= 0 }
Remaining  := { op: "REMAINING", selector: Selector, shiftId: ID }
Expression := Count | { op: "AND" | "OR", children: Expression[1..100] }
Branch     := { op: "AND", children: (Count | Remaining)[1..100] }
Constraint := { id: ID, label?: string, scope?: Scope, expression: Expression | Branch }
```

An AND branch may contain exactly one REMAINING, provided every sibling is a COUNT using an identical selector JSON value. Branches can occur anywhere in a nested expression. Other forms involving REMAINING are rejected as ambiguous. AST depth is at most 32 and the scenario has at most 10,000 nodes. NOT/IMPLIES are reserved extensions and rejected.

For selector S, branch COUNT shift set T and remainder shift R, REMAINING is true iff every ordinary assignment of a member of S on that date belongs to T ∪ {R}. It says nothing about exactly how many employees are assigned to T. Therefore GE remains GE and clause permutation cannot affect the result. Absent employees and globally excluded dates have no ordinary variables.

COUNT includes only selected employees actually assigned the target shift that date. AND means every child is true; OR means at least one child is true. All compiler booleans use full equivalence, with both true and false directions encoded. The independent verifier evaluates the AST directly without consulting solver booleans.

Allowed-shift restrictions combine by intersection, separately from AST constraints. Selectors union IDs within a field and intersect fields. Explicit empty ID arrays select nobody; an entirely empty selector selects everybody. In the visual editor, clearing a category removes its field (unrestricted category).

Shared constraints are definitions. `baseConstraintIds` activates them globally; active policies can reference them directly or through reusable constraint sets. Policy, objective and rule scopes intersect rather than override one another.


Schema 2 extends Selector with `where: Condition` and Scope with `weekProfileIds: ID[]` and `dayType: HOLIDAY | NON_HOLIDAY`. Conditions support typed EQ/NE, IN/NOT_IN, LT/LE/GT/GE, EXISTS/NOT_EXISTS and recursive AND/OR/NOT. Nonexistence differs from false, zero and empty string; NE/NOT_IN still require a present value. Conditions are predicates, not additional constraint-AST operators. Group membership is resolved on each date from retained employment/attribute versions. Operational coverage and cross-day rules have their own declarative contracts; see `EVOLUTION.md`, `API.md` and the schema-2 reference examples.
