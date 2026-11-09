#include "rostercore/core.hpp"
#include <algorithm>
#include <functional>
namespace rostercore {
Json importPolicy(const Json &scenario, const Json &document, bool dryRun,
                  const Json &mappings) {
  validate(scenario);
  validateSchema(document, "planning-policy");
  if (!mappings.is_object())
    throw Error("MAPPINGS", "/mappings",
                "Mappings must be an object of symbolic IDs to existing IDs");
  Json policy = document["policy"], updated = scenario;
  Json unresolved = Json::array();
  std::set<std::string> declared;
  std::map<std::string, std::set<std::string>> known;
  for (auto pair : {std::pair{"employee", "employees"},
                    {"type", "employeeTypes"},
                    {"group", "groups"},
                    {"shift", "shifts"},
                    {"constraint", "constraints"},
                    {"constraintSet", "constraintSets"},
                    {"attribute", "attributeDefinitions"},
                    {"workPattern", "workPatterns"},
                    {"weekProfile", "weekProfiles"}})
    for (auto &e : scenario.value(pair.second, Json::array()))
      known[pair.first].insert(e["id"]);
  for (auto &dep : policy["dependencies"]) {
    std::string symbol = dep["symbol"], kind = dep["kind"];
    if (symbol.empty() || symbol[0] != '@' || !declared.insert(symbol).second)
      throw Error("DEPENDENCY", "/policy/dependencies",
                  "Dependency symbols must be unique and start with @");
    if (mappings.contains(symbol)) {
      if (!mappings[symbol].is_string() ||
          !known[kind].contains(mappings[symbol].get<std::string>()))
        throw Error(
            "REFERENCE", "/mappings",
            "Mapping must target an existing entity of the declared kind");
    } else
      unresolved.push_back(dep);
  }
  for (auto it = mappings.begin(); it != mappings.end(); ++it)
    if (!declared.contains(it.key()))
      throw Error("MAPPINGS", "/mappings",
                  "Mapping for an undeclared dependency: " + it.key());
  std::function<void(Json &)> replace = [&](Json &v) {
    if (v.is_string()) {
      auto key = v.get<std::string>();
      if (mappings.contains(key))
        v = mappings[key];
    } else if (v.is_array())
      for (auto &x : v)
        replace(x);
    else if (v.is_object()) {
      Json rebuilt = Json::object();
      for (auto it = v.begin(); it != v.end(); ++it) {
        auto x = it.value();
        replace(x);
        auto key = it.key();
        if (mappings.contains(key))
          key = mappings[key].get<std::string>();
        rebuilt[key] = x;
      }
      v = rebuilt;
    }
  };
  replace(policy);
  policy["dependencies"] = unresolved;
  if (!unresolved.empty() &&
      (!policy["draft"].get<bool>() || policy["active"].get<bool>()))
    throw Error("UNRESOLVED_DEPENDENCY", "/policy/dependencies",
                "Unresolved imports must remain inactive drafts");
  Json before = nullptr;
  int index = -1;
  for (size_t i = 0; i < updated["policies"].size(); ++i)
    if (updated["policies"][i]["id"] == policy["id"]) {
      index = int(i);
      before = updated["policies"][i];
    }
  std::string operation = document["operation"];
  if (operation == "CREATE") {
    if (document.contains("expectedRevision"))
      throw Error("REVISION", "/expectedRevision",
                  "CREATE must not specify expectedRevision");
    if (index >= 0)
      throw Error("POLICY_EXISTS", "/policy/id",
                  "CREATE cannot overwrite an existing policy");
    if (policy["revision"] != 1)
      throw Error("REVISION", "/policy/revision",
                  "CREATE starts at revision 1");
    updated["policies"].push_back(policy);
  } else {
    if (index < 0)
      throw Error("POLICY_NOT_FOUND", "/policy/id",
                  "REPLACE requires an existing policy");
    if (!document.contains("expectedRevision") ||
        document["expectedRevision"] != before["revision"])
      throw Error("REVISION_CONFLICT", "/expectedRevision",
                  "Policy revision changed or expectedRevision is missing");
    if (policy["revision"].get<int>() != before["revision"].get<int>() + 1)
      throw Error("REVISION", "/policy/revision",
                  "Replacement revision must increase by exactly one");
    updated["policies"][index] = policy;
  }
  updated["revision"] = updated["revision"].get<int>() + 1;
  validate(updated);
  auto definition = [](const Json &p) {
    auto o = p["objective"];
    o["_policyScope"] = p.value("scope", Json::object());
    return objectiveFingerprint(o);
  };
  bool changed = before.is_null() || definition(before) != definition(policy);
  auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
  out["preview"] = {{"operation", operation},
                    {"policyId", policy["id"]},
                    {"before", before},
                    {"after", policy},
                    {"unresolvedDependencies", unresolved},
                    {"historyRecalculationRequired",
                     changed && !scenario["history"]["assignments"].empty()}};
  if (!dryRun)
    out["scenario"] = updated;
  return out;
}
Json syncHR(const Json &scenario, const Json &document, bool dryRun) {
  validate(scenario);
  validateSchema(document, "hr-events");
  Json updated = scenario;
  using Key = std::pair<std::string, std::string>;
  std::map<Key, Json> state;
  for (auto &e : scenario["hrState"]["events"])
    state[{e["source"], e["externalId"]}] = e;
  Json changes = Json::array();
  bool snapshot = document.contains("snapshot");
  std::string source =
      snapshot ? document["snapshot"]["source"].get<std::string>() : "";
  int snapshotRevision =
      snapshot ? document["snapshot"]["revision"].get<int>() : 0;
  if (snapshot && updated["hrState"]["snapshotRevisions"].value(source, 0) >=
                      snapshotRevision) {
    auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
    out["preview"] = {{"changes", changes}, {"ignoredStaleSnapshot", true}};
    if (!dryRun)
      out["scenario"] = scenario;
    return out;
  }
  std::set<Key> included;
  std::set<std::string> eventIds;
  for (auto &e : document["events"]) {
    Key key = {e["source"], e["externalId"]};
    int rev = e["revision"];
    if (!eventIds.insert(e["eventId"]).second)
      throw Error("HR_EVENT_ID", "/events",
                  "Event IDs must be unique within a batch");
    if (snapshot && (key.first != source || rev > snapshotRevision))
      throw Error("HR_SNAPSHOT", "/snapshot",
                  "Snapshot events require matching source and revision <= "
                  "snapshot revision");
    included.insert(key);
    int floor = updated["hrState"]["snapshotRevisions"].value(key.first, 0);
    if (state.contains(key)) {
      auto old = state[key];
      int previous = old["revision"];
      if (rev < previous)
        continue;
      if (rev == previous) {
        if (old != e)
          throw Error("HR_REVISION_CONFLICT", "/events",
                      "Equal revision has different payload");
        continue;
      }
    }
    if (rev <= floor)
      continue;
    if (e.contains("partialIntervals") && !e["partialIntervals"].empty())
      throw Error("UNSUPPORTED_PARTIAL_ABSENCE", "/events",
                  "Partial-day leave is represented but not operational in "
                  "this version");
    state[key] = e;
    changes.push_back({{"source", key.first},
                       {"externalId", key.second},
                       {"operation", e["operation"]},
                       {"revision", rev}});
  }
  if (snapshot) {
    for (auto &[key, e] : state)
      if (key.first == source && !included.contains(key) &&
          e["revision"].get<int>() <= snapshotRevision) {
        e["operation"] = "DELETE";
        e["revision"] = snapshotRevision;
        e["eventId"] = "snapshot:" + source + ":" +
                       std::to_string(snapshotRevision) + ":" + key.second;
        changes.push_back({{"source", source},
                           {"externalId", key.second},
                           {"operation", "DELETE"},
                           {"revision", snapshotRevision}});
      }
    updated["hrState"]["snapshotRevisions"][source] = snapshotRevision;
  }
  updated["hrState"]["events"] = Json::array();
  for (auto &[key, e] : state) {
    (void)key;
    updated["hrState"]["events"].push_back(e);
  }
  if (!changes.empty())
    updated["revision"] = updated["revision"].get<int>() + 1;
  validate(updated);
  Scenario normalized(updated);
  std::map<std::string, int> employees, shifts;
  for (size_t e = 0; e < normalized.employees.size(); ++e)
    employees[normalized.employees[e].id] = int(e);
  for (size_t t = 0; t < normalized.shifts.size(); ++t)
    shifts[normalized.shifts[t].id] = int(t);
  for (auto section : {"publishedAssignments", "history"}) {
    auto assignments = std::string(section) == "history"
                           ? scenario["history"]["assignments"]
                           : scenario["publishedAssignments"];
    for (auto &a : assignments) {
      int e = employees.at(a["employeeId"]), d = day(a["date"]),
          t = shifts.at(a["shiftId"]);
      bool conflict =
          normalized.shifts[t].kind == "WORKING" && normalized.absent(e, d);
      for (auto &i : a.value("intervals", normalized.shifts[t].intervals))
        if (i["endDayOffset"] == 1 && i["end"] != "00:00" &&
            normalized.absent(e, d + 1))
          conflict = true;
      if (conflict)
        throw Error("HR_PROTECTED_CONFLICT", "/events",
                    "Absence conflicts with protected work for " +
                        a["employeeId"].get<std::string>() + " on " +
                        a["date"].get<std::string>() +
                        "; review publication/history explicitly");
    }
  }
  auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
  out["preview"] = {{"changes", changes},
                    {"mutableSchedulesRequireReplanning", !changes.empty()}};
  if (!dryRun)
    out["scenario"] = updated;
  return out;
}
Json aiContext(const Json &j) {
  validate(j);
  Json context = {{"format", "rostercore.ai-context"},
                  {"schemaVersion", 1},
                  {"engineVersion", version},
                  {"scenarioId", j["id"]},
                  {"scenarioRevision", j["revision"]},
                  {"employeeTypes", j["employeeTypes"]},
                  {"groups", j["groups"]},
                  {"shifts", j["shifts"]},
                  {"constraints", j["constraints"]},
                  {"constraintSets", j["constraintSets"]},
                  {"policies", j["policies"]},
                  {"employees", Json::array()}};
  for (auto key : {"attributeDefinitions", "workPatterns", "weekProfiles",
                   "weekConfiguration", "dutyRequirements", "temporalRules",
                   "workPatternAssignmentRules", "spacingRules", "allowedShifts", "baseConstraintIds"})
    context[key] =
        j.value(key, std::string(key) == "weekConfiguration" ? Json::object()
                                                             : Json::array());
  context["schemaVersion"] = 4;
  context["configurationHash"]=configurationHash(j);context["referenceDate"]=j["calendar"]["start"];context["calendar"]=j["calendar"];context["entityHashes"]=Json::object();
  for(auto key:{"employeeTypes","attributeDefinitions","groups","shifts","workPatterns","workPatternAssignmentRules","weekProfiles","availability","allowedShifts","constraints","constraintSets","policies","dutyRequirements","temporalRules","spacingRules"})for(auto&entity:j.value(key,Json::array()))context["entityHashes"][key][entity["id"].get<std::string>()]=integrityHash(entity);
  context["protectedHistoryThrough"]=j["history"].value("through",Json(nullptr));context["protectedPublicationCount"]=j["publishedAssignments"].size();
  std::set<std::string> attributes;
  std::function<void(const Json &)> visit = [&](const Json &v) {
    if (v.is_object()) {
      if (v.contains("attributeId") && v["attributeId"].is_string())
        attributes.insert(v["attributeId"].get<std::string>());
      if (v.contains("selector") && v["selector"].contains("attributes"))
        for (auto it = v["selector"]["attributes"].begin();
             it != v["selector"]["attributes"].end(); ++it)
          attributes.insert(it.key());
      for (auto it = v.begin(); it != v.end(); ++it)
        visit(it.value());
    } else if (v.is_array())
      for (auto &x : v)
        visit(x);
  };
  visit(context);
  for (auto &e : j["employees"]) {
    Json attrs = Json::object();
    for (auto &key : attributes)
      if (e["attributes"].contains(key))
        attrs[key] = e["attributes"][key];
    context["employees"].push_back(
        {{"id", e["id"]}, {"typeId", e["typeId"]}, {"attributes", attrs}});
  }
  for (size_t i = 0; i < j["employees"].size(); ++i) {
    auto &e = j["employees"][i];
    for (auto key : {"employment", "workPatternId"})
      if (e.contains(key))
        context["employees"][i][key] = e[key];
    if (e.contains("versions")) {
      Json versions = e["versions"];
      for (auto &v : versions)
        if (v.contains("attributes")) {
          Json retained = Json::object();
          for (auto &key : attributes)
            if (v["attributes"].contains(key))
              retained[key] = v["attributes"][key];
          v["attributes"] = retained;
        }
      context["employees"][i]["versions"] = versions;
    }
  }
  context["supported"] = {{"operators", {"COUNT", "AND", "OR", "REMAINING"}},
                          {"objectives", {"CUMULATIVE_FAIRNESS"}},
                          {"measures", {"COUNT"}}};
  auto out = response("CONTEXT");
  out["context"] = context;
  return out;
}
} // namespace rostercore
