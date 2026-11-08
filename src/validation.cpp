#include "rostercore/core.hpp"
#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <nlohmann/json-schema.hpp>
namespace rostercore {
void validateSchema(const Json &j, const std::string &name) {
  auto root = std::filesystem::path(ROSTERCORE_SCHEMA_DIR);
  if (auto p = std::getenv("ROSTERCORE_SCHEMA_DIR"))
    root = p;
  std::ifstream file(root / (name + ".schema.json"));
  if (!file)
    throw Error("SCHEMA_NOT_FOUND", "/",
                "Set ROSTERCORE_SCHEMA_DIR to the installed schema directory");
  try {
    Json schema;
    file >> schema;
    nlohmann::json_schema::json_validator validator;
    validator.set_root_schema(schema);
    validator.validate(j);
  } catch (const std::exception &e) {
    throw Error("SCHEMA", "/", e.what());
  }
}
void validate(const Json &j) {
  validateSchema(j, "scenario");
  validateEvolution(j);
  auto fail = [](std::string c, std::string p, std::string m) {
    throw Error(c, p, m);
  };
  auto unique = [&](const Json &xs, const std::string &path) {
    std::set<std::string> seen;
    for (auto &x : xs)
      if (!seen.insert(x["id"]).second)
        fail("DUPLICATE_ID", path,
             "Duplicate ID: " + x["id"].get<std::string>());
    return seen;
  };
  auto types = unique(j["employeeTypes"], "/employeeTypes"),
       employees = unique(j["employees"], "/employees"),
       groups = unique(j["groups"], "/groups"),
       shifts = unique(j["shifts"], "/shifts"),
       constraints = unique(j["constraints"], "/constraints"),
       sets = unique(j["constraintSets"], "/constraintSets");
  unique(j["policies"], "/policies");
  unique(j["availability"], "/availability");
  unique(j["allowedShifts"], "/allowedShifts");
  if (employees.empty() || employees.size() > 200 || shifts.empty() ||
      shifts.size() > 40)
    fail("SIZE_LIMIT", "/", "Require 1–200 employees and 1–40 shifts");
  std::map<const void *, std::set<std::string>> draftAllowed;
  auto require = [&](const std::set<std::string> &known, const Json &ids,
                     const std::string &path, bool draft = false) {
    for (auto &id : ids)
      if (!known.contains(id.get<std::string>()) &&
          !(draft && draftAllowed[&known].contains(id.get<std::string>())))
        fail("REFERENCE", path, "Unknown reference: " + id.get<std::string>());
  };
  auto selector = [&](const Json &s, bool draft = false) {
    if (s.contains("employeeIds"))
      require(employees, s["employeeIds"], "/selector/employeeIds", draft);
    if (s.contains("typeIds"))
      require(types, s["typeIds"], "/selector/typeIds", draft);
    if (s.contains("groupIds"))
      require(groups, s["groupIds"], "/selector/groupIds", draft);
  };
  auto scope = [&](const Json &s) {
    if (s.contains("start"))
      day(s["start"]);
    if (s.contains("end"))
      day(s["end"]);
    if (s.contains("start") && s.contains("end") &&
        day(s["start"]) > day(s["end"]))
      fail("DATE_RANGE", "/scope", "start must precede end");
    if (s.contains("excludedDates"))
      for (auto &d : s["excludedDates"])
        day(d);
  };
  for (auto &e : j["employees"])
    require(types, Json::array({e["typeId"]}), "/employees/typeId");
  for (auto &g : j["groups"])
    selector(g["selector"]);
  for (auto &s : j["shifts"]) {
    if ((s["kind"] == "OFF" && !s["intervals"].empty()) ||
        (s["kind"] == "WORKING" && s["intervals"].empty() &&
         s.value("variants", Json::array()).empty()))
      fail("SHIFT_INTERVALS", "/shifts",
           "OFF must have no intervals; WORKING must have intervals");
    std::vector<std::pair<int, int>> intervals;
    auto minute = [](std::string x) {
      return std::stoi(x.substr(0, 2)) * 60 + std::stoi(x.substr(3, 2));
    };
    for (auto &i : s["intervals"]) {
      int a = minute(i["start"]),
          b = minute(i["end"]) + 1440 * i["endDayOffset"].get<int>();
      if (b <= a || b - a > 1440)
        fail("SHIFT_INTERVALS", "/shifts",
             "Intervals must have positive duration, at most 24 civil hours");
      intervals.emplace_back(a, b);
    }
    std::sort(intervals.begin(), intervals.end());
    for (size_t i = 1; i < intervals.size(); ++i)
      if (intervals[i].first < intervals[i - 1].second)
        fail("SHIFT_INTERVALS", "/shifts", "Shift intervals overlap");
  }
  scope(j["calendar"]);
  for (auto &d : j["calendar"]["excludedDates"])
    day(d);
  for (auto &r : j["calendar"]["excludedRanges"])
    scope(r);
  for (auto &w : j["calendar"]["excludedIsoWeeks"]) {
    auto str = w.get<std::string>();
    int year = std::stoi(str.substr(0, 4)), week = std::stoi(str.substr(6));
    if (week < 1 || week > 53 ||
        isoWeek(day(std::to_string(year) + "-01-04") + 7 * (week - 1)) != str)
      fail("ISO_WEEK", "/calendar/excludedIsoWeeks",
           "Invalid ISO week: " + str);
  }
  if (j["calendar"]["timezone"].get<std::string>().find('/') ==
          std::string::npos &&
      j["calendar"]["timezone"] != "UTC")
    fail("TIMEZONE", "/calendar/timezone",
         "Provide an IANA timezone label or UTC");
  for (auto &a : j["availability"]) {
    selector(a["selector"]);
    scope(a["scope"]);
  }
  for (auto &a : j["allowedShifts"]) {
    selector(a["selector"]);
    require(shifts, a["shiftIds"], "/allowedShifts");
    scope(a["scope"]);
  }
  size_t nodes = 0;
  std::function<void(const Json &, int, bool, bool)> expression;
  expression = [&](const Json &x, int depth, bool remainingChild, bool draft) {
    if (++nodes > 10000 || depth > 32)
      fail("AST_LIMIT", "/constraints",
           "Constraint AST exceeds 10,000 nodes or depth 32");
    std::string op = x["op"];
    if (op == "COUNT" || op == "REMAINING") {
      selector(x["selector"], draft);
      require(shifts, Json::array({x["shiftId"]}), "/constraints/shiftId",
              draft);
      if (op == "REMAINING" && !remainingChild)
        fail("AMBIGUOUS_REMAINING", "/constraints",
             "REMAINING requires a flat AND branch with identical selectors");
      return;
    }
    int remains = 0;
    for (auto &c : x["children"])
      remains += c["op"] == "REMAINING";
    if (remains) {
      if (op != "AND" || remains != 1)
        fail("AMBIGUOUS_REMAINING", "/constraints",
             "Exactly one REMAINING per flat AND branch");
      Json sel;
      for (auto &c : x["children"])
        if (c["op"] == "REMAINING")
          sel = c["selector"];
      for (auto &c : x["children"])
        if ((c["op"] != "COUNT" && c["op"] != "REMAINING") ||
            c["selector"] != sel)
          fail("AMBIGUOUS_REMAINING", "/constraints",
               "REMAINING siblings must be atoms with identical selectors");
    }
    for (auto &c : x["children"])
      expression(c, depth + 1, remains > 0, draft);
  };
  auto constraint = [&](const Json &c, bool draft = false) {
    scope(c.value("scope", Json::object()));
    expression(c["expression"], 0, false, draft);
  };
  require(constraints, j["baseConstraintIds"], "/baseConstraintIds");
  for (auto &c : j["constraints"])
    constraint(c);
  for (auto &s : j["constraintSets"])
    require(constraints, s["constraintIds"], "/constraintSets");
  std::set<std::string> objectiveIds;
  for (auto &p : j["policies"]) {
    bool draft = p["draft"];
    draftAllowed.clear();
    std::set<std::string> symbols;
    for (auto &dep : p["dependencies"]) {
      std::string symbol = dep["symbol"], kind = dep["kind"];
      if (symbol[0] != '@' || !symbols.insert(symbol).second)
        fail("DEPENDENCY", "/policies/dependencies",
             "Dependency symbols must be unique and start with @");
      const void *address = kind == "employee"     ? &employees
                            : kind == "type"       ? &types
                            : kind == "group"      ? &groups
                            : kind == "shift"      ? &shifts
                            : kind == "constraint" ? &constraints
                                                   : &sets;
      draftAllowed[address].insert(symbol);
    }
    if (p["active"] && (draft || !p["dependencies"].empty()))
      fail("UNRESOLVED_DEPENDENCY", "/policies",
           "Draft or unresolved policy cannot be active");
    unique(p["constraints"], "/policies/constraints");
    scope(p.value("scope", Json::object()));
    for (auto &c : p["constraints"])
      constraint(c, draft);
    require(constraints, p["sharedConstraintIds"],
            "/policies/sharedConstraintIds", draft);
    require(sets, p["constraintSetIds"], "/policies/constraintSetIds", draft);
    auto &o = p["objective"];
    if (!objectiveIds.insert(o["id"]).second)
      fail("DUPLICATE_ID", "/policies/objective/id",
           "Objective IDs must be unique across policies");
    selector(o["selector"], draft);
    require(shifts, o["shiftIds"], "/objective/shiftIds", draft);
    if (o["shiftIds"].empty() && o.value("fairnessTags", Json::array()).empty())
      fail("EMPTY_TARGET", "/objective/shiftIds",
           "At least one target shift is required");
    scope(o.value("scope", Json::object()));
    if (o["participation"] == "CUSTOM_WEIGHTED" && !o.contains("weights"))
      fail("WEIGHTS", "/objective", "CUSTOM_WEIGHTED requires weights");
    if (o.contains("weights")) {
      for (auto it = o["weights"].begin(); it != o["weights"].end(); ++it)
        require(employees, Json::array({it.key()}), "/objective/weights",
                draft);
      if (o["participation"] != "CUSTOM_WEIGHTED")
        fail("WEIGHTS", "/objective",
             "weights are only valid for CUSTOM_WEIGHTED");
    }
  }
  Scenario s(j);
  for (auto &g : j["groups"])
    s.select(g["selector"]);
  if (s.days.size() * s.employees.size() * s.shifts.size() > 1000000)
    fail("SIZE_LIMIT", "/", "Assignment grid exceeds 1,000,000 cells");
  for (auto &p : s.activePolicies) {
    auto &o = p["objective"];
    auto selected = s.select(o["selector"]);
    if (selected.empty() && fairnessMembers(s, o).empty())
      fail("NO_PARTICIPANTS", "/objective",
           "Active objective selects no participants");
    if (o["participation"] == "CUSTOM_WEIGHTED")
      for (int e : selected)
        if (!o["weights"].contains(s.employees[e].id))
          fail("WEIGHTS", "/objective/weights",
               "Each selected employee requires a positive weight");
  }
  std::set<std::pair<std::string, std::string>> historyCells;
  for (auto &a : j["history"]["assignments"]) {
    require(employees, Json::array({a["employeeId"]}), "/history");
    require(shifts, Json::array({a["shiftId"]}), "/history");
    if (day(a["date"]) >= s.days.front())
      fail("HISTORY_OVERLAP", "/history",
           "History must strictly precede the planning horizon");
    if (!historyCells.emplace(a["employeeId"], a["date"]).second)
      fail("HISTORY_DUPLICATE", "/history", "Duplicate historical assignment");
  }
  if (j["history"].contains("through")) {
    int through = day(j["history"]["through"]);
    if (through >= s.days.front())
      fail("HISTORY_OVERLAP", "/history/through",
           "Consolidated watermark must precede horizon");
    for (auto &a : j["history"]["assignments"])
      if (day(a["date"]) > through)
        fail("HISTORY_WATERMARK", "/history",
             "Assignment exceeds consolidated watermark");
  }
  std::set<std::pair<std::string, std::string>> snapshots;
  for (auto &a : j["history"]["fairnessSnapshots"]) {
    if (day(a["date"]) >= s.days.front())
      fail("HISTORY_OVERLAP", "/history/fairnessSnapshots",
           "Historical snapshot overlaps horizon");
    if (!snapshots.emplace(a["objectiveId"], a["date"]).second)
      fail("HISTORY_DUPLICATE", "/history/fairnessSnapshots",
           "Duplicate snapshot");
    for (auto it = a["weights"].begin(); it != a["weights"].end(); ++it)
      require(employees, Json::array({it.key()}), "/history/weights");
  }
  std::set<std::pair<std::string, std::string>> published;
  for (auto &a : j["publishedAssignments"]) {
    require(employees, Json::array({a["employeeId"]}), "/publishedAssignments");
    require(shifts, Json::array({a["shiftId"]}), "/publishedAssignments");
    if (!published.emplace(a["employeeId"], a["date"]).second)
      fail("DUPLICATE_ASSIGNMENT", "/publishedAssignments",
           "Duplicate published cell");
    day(a["date"]);
  }
  std::set<std::pair<std::string, std::string>> hrKeys;
  for (auto &e : j["hrState"]["events"]) {
    require(employees, Json::array({e["employeeId"]}), "/hrState");
    scope(e);
    if (e.contains("partialIntervals") && !e["partialIntervals"].empty())
      fail("UNSUPPORTED_PARTIAL_ABSENCE", "/hrState",
           "Operational partial-day leave is not supported");
    if (!hrKeys.emplace(e["source"], e["externalId"]).second)
      fail("HR_DUPLICATE", "/hrState", "Duplicate HR source/external ID");
  }
  if (j["search"]["deterministic"] && j["search"]["workers"] != 1)
    fail("DETERMINISM", "/search/workers",
         "Deterministic mode requires one worker");
}
} // namespace rostercore
