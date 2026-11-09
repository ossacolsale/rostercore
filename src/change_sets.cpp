#include "rostercore/core.hpp"
#include <algorithm>
namespace rostercore {
namespace {
const std::map<std::string, std::string> entities = {
    {"EMPLOYEE_TYPE", "employeeTypes"},
    {"ATTRIBUTE", "attributeDefinitions"},
    {"GROUP", "groups"},
    {"SHIFT", "shifts"},
    {"WORK_PATTERN", "workPatterns"},
    {"PATTERN_RULE", "workPatternAssignmentRules"},
    {"WEEK_PROFILE", "weekProfiles"},
    {"AVAILABILITY", "availability"},
    {"ALLOWED_SHIFTS", "allowedShifts"},
    {"CONSTRAINT", "constraints"},
    {"CONSTRAINT_SET", "constraintSets"},
    {"POLICY", "policies"},
    {"COVERAGE", "dutyRequirements"},
    {"TEMPORAL_RULE", "temporalRules"},
    {"SPACING_RULE", "spacingRules"}};
void reject(std::string code, std::string message) {
  throw Error(code, "/operations", message);
}
size_t find(const Json &items, const std::string &id) {
  for (size_t i = 0; i < items.size(); ++i)
    if (items[i]["id"] == id)
      return i;
  reject("REFERENCE", "Unknown entity: " + id);
  return 0;
}
void protectDate(const Json &s, const std::string &at) {
  if (s["history"].contains("through") &&
      at <= s["history"]["through"].get<std::string>())
    reject("HISTORY_PROTECTED",
           "Dated changes must start after confirmed actual history");
}
void datedEmployee(Json &s, const Json &op) {
  const std::string id = op["employeeId"], from = op["effectiveFrom"];
  protectDate(s, from);
  auto idx = find(s["employees"], id);
  auto &e = s["employees"][idx];
  if (op["op"] == "END_EMPLOYMENT") {
    if (!e.contains("employment"))
      e["employment"] = {{"validFrom", "1900-01-01"}};
    e["employment"]["validTo"] = from;
    return;
  }
  auto versions = e.value("versions", Json::array());
  Json next = {{"validFrom", from}};
  std::string until;
  for (auto &v : versions) {
    std::string start = v["validFrom"];
    if (start > from && (until.empty() || start < until))
      until = start;
    if (effective(v, day(from))) {
      next = v;
      next["validFrom"] = from;
      if (v.contains("validTo"))
        until = v["validTo"];
      v["validTo"] = from;
    }
  }
  Json kept = Json::array();
  for (auto &v : versions)
    if (!v.contains("validTo") || v["validFrom"] != v["validTo"])
      kept.push_back(v);
  // Preserve explicit values from the active version; defaults remain defaults.
  for (auto it = op["patch"].begin(); it != op["patch"].end(); ++it)
    if (it.key() == "attributes") {
      if (!next.contains("attributes"))
        next["attributes"] = Json::object();
      for (auto a = it.value().begin(); a != it.value().end(); ++a)
        next["attributes"][a.key()] = a.value();
    } else
      next[it.key()] = it.value();
  if (!until.empty())
    next["validTo"] = until;
  else
    next.erase("validTo");
  kept.push_back(next);
  std::sort(kept.begin(), kept.end(), [](const Json &a, const Json &b) {
    return a["validFrom"] < b["validFrom"];
  });
  e["versions"] = kept;
}
void protectedCells(const Json &before, const Json &after) {
  Scenario old(before), next(after);
  std::map<std::string, int> oldE, newE, oldT, newT;
  for (size_t e = 0; e < old.employees.size(); ++e)
    oldE[old.employees[e].id] = int(e);
  for (size_t e = 0; e < next.employees.size(); ++e)
    newE[next.employees[e].id] = int(e);
  for (size_t t = 0; t < old.shifts.size(); ++t)
    oldT[old.shifts[t].id] = int(t);
  for (size_t t = 0; t < next.shifts.size(); ++t)
    newT[next.shifts[t].id] = int(t);
  auto locks = before["publishedAssignments"];
  for (auto &a : before["history"]["assignments"])
    locks.push_back(a);
  for (auto &a : locks) {
    std::string eid = a["employeeId"], sid = a["shiftId"];
    int d = day(a["date"]);
    if (!newE.contains(eid) || !newT.contains(sid))
      reject("PROTECTED_ASSIGNMENT",
             "A referenced employee or shift cannot be removed");
    auto oldHours = old.intervals(oldE.at(eid), d, oldT.at(sid)),
         newHours = next.intervals(newE.at(eid), d, newT.at(sid));
    auto oldAllowed = old.domain(oldE.at(eid), d,
                                 a.value("weekProfileId", old.profile(d))),
         newAllowed = next.domain(newE.at(eid), d,
                                  a.value("weekProfileId", next.profile(d)));
    bool lostDomain = std::find(oldAllowed.begin(), oldAllowed.end(),
                                oldT.at(sid)) != oldAllowed.end() &&
                      std::find(newAllowed.begin(), newAllowed.end(),
                                newT.at(sid)) == newAllowed.end();
    auto profiles = next.weekOptions(d)["profileIds"];
    bool lostProfile = a.contains("weekProfileId") &&
                       std::find(profiles.begin(), profiles.end(),
                                 a["weekProfileId"]) == profiles.end();
    auto concrete = [](const Json &v) {
      return v.is_null() ? Json(nullptr)
                         : Json{{"id", v["id"]}, {"intervals", v["intervals"]}};
    };
    if (lostDomain || lostProfile || concrete(oldHours) != concrete(newHours) ||
        old.employeeState(oldE.at(eid), d)["typeId"] !=
            next.employeeState(newE.at(eid), d)["typeId"] ||
        old.resolvedAttributes(oldE.at(eid), d) !=
            next.resolvedAttributes(newE.at(eid), d) ||
        old.active(oldE.at(eid), d) != next.active(newE.at(eid), d) ||
        old.absent(oldE.at(eid), d) != next.absent(newE.at(eid), d) ||
        old.closed(oldE.at(eid), d) != next.closed(newE.at(eid), d))
      reject("PROTECTED_ASSIGNMENT",
             "Change affects actual or published work on " +
                 a["date"].get<std::string>() +
                 "; create an explicit future revision proposal first");
  }
}
} // namespace
Json importScenario(const Json &s, const Json &doc, bool dryRun) {
  validate(s);
  validateSchema(doc, "scenario-import-request");
  if (doc["expectedRevision"] != s["revision"])
    reject("REVISION_CONFLICT",
           "Workspace changed after the import was prepared");
  auto candidate = doc["candidate"];
  validate(candidate);
  if (doc["mode"] == "NEW_SCENARIO") {
    if (candidate["id"] == s["id"])
      reject("SCENARIO_CONFLICT",
             "A new scenario requires a distinct stable ID");
  } else {
    if (candidate["id"] != s["id"])
      reject("SCENARIO_CONFLICT",
             "Replacement must retain the current scenario ID");
    if (!doc["allowHardRuleChanges"].get<bool>())
      reject(
          "HARD_RULE_AUTHORIZATION",
          "Full replacement requires explicit authorization of rule changes");
    if (candidate["history"] != s["history"] ||
        candidate["publishedAssignments"] != s["publishedAssignments"] ||
        candidate.value("appliedChangeSets", Json::array()) !=
            s.value("appliedChangeSets", Json::array()) ||
        candidate.value("archiveState", Json::object()) !=
            s.value("archiveState", Json::object()))
      reject("HISTORY_PROTECTED",
             "Replacement must preserve actual history, official assignments "
             "and import receipts exactly");
    protectedCells(s, candidate);
    candidate["revision"] = s["revision"].get<int>() + 1;
  }
  validate(candidate);
  auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
  out["preview"] = {{"mode", doc["mode"]},
                    {"scenarioIdBefore", s["id"]},
                    {"scenarioIdAfter", candidate["id"]},
                    {"employeesBefore", s["employees"].size()},
                    {"employeesAfter", candidate["employees"].size()},
                    {"scenario", candidate}};
  if (!dryRun)
    out["scenario"] = candidate;
  return out;
}
Json applyChangeSet(const Json &s, const Json &doc, bool dryRun) {
  validate(s);
  validateSchema(doc, "scenario-change-set");
  if (doc["scenarioId"] != s["id"])
    reject("SCENARIO_CONFLICT", "Change-set targets another scenario");
  auto hash = integrityHash(doc);
  for (auto &r : s.value("appliedChangeSets", Json::array()))
    if (r["id"] == doc["id"]) {
      if (r["hash"] != hash)
        reject("CHANGE_SET_CONFLICT",
               "This change-set ID was already used with different contents");
      auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
      out["preview"] = {{"idempotent", true},
                        {"appliedRevision", r["revision"]}};
      return out;
    }
  if (doc["expectedRevision"] != s["revision"] ||
      (doc.contains("expectedConfigurationHash") &&
       doc["expectedConfigurationHash"] != configurationHash(s)))
    reject("REVISION_CONFLICT", "Scenario revision or configuration hash "
                                "changed; request a new change-set");
  Json next = s, summary = Json::array();
  next["schemaVersion"] = 4;
  for (auto &op : doc["operations"]) {
    std::string name = op["op"];
    bool operational = name == "CREATE_EMPLOYEE" || name == "UPDATE_EMPLOYEE" ||
                       name == "RENAME_EMPLOYEE" || name == "END_EMPLOYMENT" ||
                       name == "SYNC_HR" || name == "SET_SEARCH" ||
                       name.ends_with("AVAILABILITY");
    if (!operational && !doc["allowHardRuleChanges"].get<bool>())
      reject("HARD_RULE_AUTHORIZATION",
             "Definition, calendar and hard-rule changes require "
             "allowHardRuleChanges=true");
    if (name == "CREATE_EMPLOYEE") {
      auto id = op["value"]["id"];
      for (auto &e : next["employees"])
        if (e["id"] == id)
          reject("DUPLICATE_ID", "Employee already exists");
      next["employees"].push_back(op["value"]);
    } else if (name == "UPDATE_EMPLOYEE" || name == "END_EMPLOYMENT")
      datedEmployee(next, op);
    else if (name == "RENAME_EMPLOYEE")
      next["employees"][find(next["employees"], op["employeeId"])]["label"] =
          op["label"];
    else if (name == "SYNC_HR") {
      auto r = syncHR(next, op["value"], false);
      if (!r.contains("scenario"))
        reject("HR_CHANGE_FAILED", r.dump());
      next = r["scenario"];
    } else if (name == "SET_WEEK_CONFIGURATION")
      next["weekConfiguration"] = op["value"];
    else if (name == "SET_CALENDAR")
      next["calendar"] = op["value"];
    else if (name == "SET_CLOSURES")
      next["calendar"]["closures"] = op["value"];
    else if (name == "SET_BASE_CONSTRAINTS")
      next["baseConstraintIds"] = op["value"];
    else if (name == "SET_SEARCH")
      next["search"] = op["value"];
    else {
      auto split = name.find('_');
      std::string kind = name.substr(split + 1), action = name.substr(0, split);
      auto section = entities.at(kind);
      if (!next.contains(section))
        next[section] = Json::array();
      auto &items = next[section];
      std::string id = action == "DELETE" ? op["id"] : op["value"]["id"];
      if (action == "CREATE") {
        for (auto &item : items)
          if (item["id"] == id)
            reject("DUPLICATE_ID", "Entity already exists: " + id);
        items.push_back(op["value"]);
      } else {
        auto i = find(items, id);
        if (integrityHash(items[i]) !=
            op["expectedEntityHash"].get<std::string>())
          reject("ENTITY_CONFLICT", "Entity changed: " + id);
        if (action == "DELETE")
          items.erase(i);
        else {
          if (kind == "POLICY" && op["value"]["revision"].get<int>() !=
                                      items[i]["revision"].get<int>() + 1)
            reject(
                "REVISION_CONFLICT",
                "Policy replacement must increment its revision exactly once");
          items[i] = op["value"];
        }
      }
    }
    summary.push_back({{"operation", name}});
  }
  next["revision"] = s["revision"].get<int>() + 1;
  if (!next.contains("appliedChangeSets"))
    next["appliedChangeSets"] = Json::array();
  next["appliedChangeSets"].push_back(
      {{"id", doc["id"]}, {"hash", hash}, {"revision", next["revision"]}});
  validate(next);
  protectedCells(s, next);
  bool rebuild = false;
  if (!next["history"]["assignments"].empty()) {
    Scenario proposed(next);
    for (auto &p : proposed.activePolicies) {
      try {
        historicalLedger(proposed, p["objective"]);
      } catch (const Error &e) {
        if (e.code == "HISTORY_REBUILD_REQUIRED" ||
            e.code == "HISTORY_SNAPSHOT_REQUIRED")
          rebuild = true;
        else
          throw;
      }
    }
  }
  auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
  out["preview"] = {{"historyRebuildRequired", rebuild},
                    {"operations", summary},
                    {"revisionBefore", s["revision"]},
                    {"revisionAfter", next["revision"]},
                    {"regenerationFrom", next["calendar"]["start"]},
                    {"actualHistoryPreserved", next["history"] == s["history"]},
                    {"publishedAssignmentsPreserved",
                     next["publishedAssignments"] == s["publishedAssignments"]},
                    {"scenario", next}};
  if (!dryRun)
    out["scenario"] = next;
  return out;
}
} // namespace rostercore
