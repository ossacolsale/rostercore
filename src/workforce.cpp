#include "rostercore/core.hpp"
#include <algorithm>
#include <functional>
namespace rostercore {
Json Scenario::employeeState(int e, int d) const {
  Json state = source["employees"].at(size_t(e));
  for (auto &v : state.value("versions", Json::array()))
    if (effective(v, d)) {
      for (auto key : {"typeId", "workPatternId"})
        if (v.contains(key))
          state[key] = v[key];
      if (v.contains("attributes"))
        for (auto it = v["attributes"].begin(); it != v["attributes"].end();
             ++it)
          state["attributes"][it.key()] = it.value();
    }
  return state;
}
Json Scenario::workPatternAssignment(int e, int d,
                                     const std::string &given) const {
  if (!active(e, d))
    return {{"origin", "INACTIVE"}};
  auto resolved = [&](Json result) {
    if (result.contains("workPatternId")) {
      bool present = false;
      for (auto &p : source.value("workPatterns", Json::array()))
        if (p["id"] == result["workPatternId"])
          for (auto &v : p["versions"])
            present |= effective(v, d);
      if (!present)
        throw Error("WORK_PATTERN_GAP", "/workPatterns",
                    "No effective work pattern for " + employees[e].id +
                        " on " + date(d) + ": " +
                        result["workPatternId"].get<std::string>());
    }
    return result;
  };
  auto &employee = source["employees"].at(size_t(e));
  bool automatic = false;
  for (auto &v : employee.value("versions", Json::array()))
    if (effective(v, d) && v.contains("workPatternId")) {
      if (!v["workPatternId"].is_null())
        return resolved({{"origin", "TEMPORAL_OVERRIDE"},
                         {"workPatternId", v["workPatternId"]},
                         {"validFrom", v["validFrom"]}});
      automatic = true;
    }
  if (!automatic && employee.contains("workPatternId"))
    return resolved({{"origin", "INDIVIDUAL"},
                     {"workPatternId", employee["workPatternId"]}});
  int priority = -1;
  std::string pattern;
  Json ids = Json::array();
  std::set<std::string> patterns;
  for (auto &r : source.value("workPatternAssignmentRules", Json::array()))
    if (r["enabled"].get<bool>() && effective(r, d)) {
      auto members = select(r["selector"], d, {}, given);
      if (std::find(members.begin(), members.end(), e) == members.end())
        continue;
      int rank = r["priority"];
      if (rank < priority)
        continue;
      if (rank > priority) {
        priority = rank;
        pattern = r["workPatternId"];
        ids = Json::array();
        patterns.clear();
      }
      ids.push_back(r["id"]);
      patterns.insert(r["workPatternId"].get<std::string>());
    }
  if (patterns.size() > 1)
    throw Error("WORK_PATTERN_ASSIGNMENT_CONFLICT",
                "/workPatternAssignmentRules",
                "Employee " + employees[e].id + " on " + date(d) +
                    " matches incompatible top-priority work-pattern rules: " +
                    ids.dump());
  if (priority >= 0)
    return resolved({{"origin", "AUTOMATIC_RULE"},
                     {"workPatternId", pattern},
                     {"ruleIds", ids}});
  return {{"origin", "NONE"}};
}
bool Scenario::active(int e, int d) const {
  auto &employee = source["employees"].at(size_t(e));
  return !employee.contains("employment") ||
         effective(employee["employment"], d);
}
Json Scenario::resolvedAttributes(int e, int d) const {
  Json resolved = Json::object();
  for (auto &a : source.value("attributeDefinitions", Json::array()))
    if (effective(a, d) && a.contains("default"))
      resolved[a["id"].get<std::string>()] = {{"origin", "DEFAULT"},
                                              {"value", a["default"]}};
  auto state = employeeState(e, d);
  for (auto it = state["attributes"].begin(); it != state["attributes"].end();
       ++it) {
    bool enabled = true;
    for (auto &a : source.value("attributeDefinitions", Json::array()))
      if (a["id"] == it.key() && !effective(a, d))
        enabled = false;
    if (!enabled) {
      resolved[it.key()] = {{"origin", "MISSING"}};
      continue;
    }
    std::string origin = "EXPLICIT";
    for (auto &v :
         source["employees"].at(size_t(e)).value("versions", Json::array()))
      if (effective(v, d) && v.contains("attributes") &&
          v["attributes"].contains(it.key()))
        origin = "TEMPORAL_OVERRIDE";
    resolved[it.key()] = it.value().is_null()
                             ? Json{{"origin", "MISSING"}}
                             : Json{{"origin", origin}, {"value", it.value()}};
  }
  return resolved;
}
static bool condition(const Json &x, const Json &attributes) {
  std::string op = x["op"];
  if (op == "AND" || op == "OR") {
    bool result = op == "AND";
    for (auto &child : x["children"]) {
      bool yes = condition(child, attributes);
      if (op == "AND")
        result &= yes;
      else
        result |= yes;
    }
    return result;
  }
  if (op == "NOT")
    return !condition(x["child"], attributes);
  std::string id = x["attributeId"];
  bool exists = attributes.contains(id) && attributes[id].contains("value");
  if (op == "EXISTS")
    return exists;
  if (op == "NOT_EXISTS")
    return !exists;
  if (!exists)
    return false;
  auto &value = attributes[id]["value"];
  if (op == "IN" || op == "NOT_IN") {
    bool found = std::find(x["values"].begin(), x["values"].end(), value) !=
                 x["values"].end();
    return op == "IN" ? found : !found;
  }
  if (op == "EQ" || op == "NE")
    return op == "EQ" ? value == x["value"] : value != x["value"];
  if (!value.is_number() || !x["value"].is_number())
    return false;
  double a = value.get<double>(), b = x["value"].get<double>();
  if (op == "LT")
    return a < b;
  if (op == "LE")
    return a <= b;
  if (op == "GT")
    return a > b;
  return a >= b;
}
std::vector<int> Scenario::select(const Json &s, int onDate,
                                  std::set<std::string> visiting,
                                  const std::string &profileId) const {
  if (onDate < 0) {
    std::set<int> unionMembers;
    for (int d : days) {
      auto selected = select(s, d, visiting, profileId);
      unionMembers.insert(selected.begin(), selected.end());
    }
    return {unionMembers.begin(), unionMembers.end()};
  }
  std::set<int> groupMembers;
  if (s.contains("groupIds"))
    for (auto &g : s["groupIds"]) {
      std::string id = g;
      if (!groups.contains(id))
        throw Error("REFERENCE", "/selector/groupIds", "Unknown group: " + id);
      if (!visiting.insert(id).second)
        throw Error("GROUP_CYCLE", "/groups", "Cyclic group: " + id);
      auto &group = groups.at(id);
      if (matches(group, onDate, profileId)) {
        auto members = select(group["selector"], onDate, visiting, profileId);
        groupMembers.insert(members.begin(), members.end());
      } else
        select(group["selector"], onDate, visiting, profileId);
      visiting.erase(id);
    }
  std::vector<int> result;
  for (size_t i = 0; i < employees.size(); ++i) {
    int e = int(i);
    if (!active(e, onDate))
      continue;
    auto state = employeeState(e, onDate);
    bool yes = true;
    if (s.contains("employeeIds"))
      yes &= std::find(s["employeeIds"].begin(), s["employeeIds"].end(),
                       employees[i].id) != s["employeeIds"].end();
    if (s.contains("typeIds"))
      yes &= std::find(s["typeIds"].begin(), s["typeIds"].end(),
                       state["typeId"]) != s["typeIds"].end();
    if (s.contains("groupIds"))
      yes &= groupMembers.contains(e);
    if (s.contains("attributes") || s.contains("where")) {
      auto attrs = resolvedAttributes(e, onDate);
      if (s.contains("attributes"))
        for (auto it = s["attributes"].begin(); it != s["attributes"].end();
             ++it)
          yes &= attrs.contains(it.key()) &&
                 attrs[it.key()].contains("value") &&
                 attrs[it.key()]["value"] == it.value();
      if (s.contains("where"))
        yes &= condition(s["where"], attrs);
    }
    if (yes)
      result.push_back(e);
  }
  return result;
}
bool Scenario::closed(int e, int d) const {
  for (auto &c : source["calendar"].value("closures", Json::array()))
    if (effective(c, d)) {
      auto selected = select(c["selector"], d);
      if (std::find(selected.begin(), selected.end(), e) == selected.end())
        continue;
      bool exception = false;
      for (auto &x : c["exceptions"])
        if (day(x["date"]) == d) {
          auto members = select(x["selector"], d);
          exception |=
              std::find(members.begin(), members.end(), e) != members.end();
        }
      if (!exception)
        return true;
    }
  return false;
}
bool Scenario::operational(int d) const {
  if (excluded(d))
    return false;
  bool any = false;
  for (size_t e = 0; e < employees.size(); ++e)
    if (active(int(e), d)) {
      any = true;
      if (!closed(int(e), d))
        return true;
    }
  return !any;
}
bool Scenario::plannable(int e, int d) const {
  return active(e, d) && !excluded(d) && !closed(e, d) && !absent(e, d);
}
Json Scenario::intervals(int e, int d, int shift,
                         const std::string &given) const {
  auto &definition = source["shifts"].at(size_t(shift));
  auto variants = definition.value("variants", Json::array());
  if (variants.empty())
    return {{"id", definition["id"]}, {"intervals", definition["intervals"]}};
  std::string p = given.empty() ? profile(d) : given;
  auto arrangement = workPatternAssignment(e, d, p);
  Json selected = nullptr;
  int priority = -1;
  for (auto &v : variants) {
    if (!matches(v, d, p))
      continue;
    if (v.contains("workPatternIds")) {
      auto &patterns = v["workPatternIds"];
      if (!arrangement.contains("workPatternId") ||
          std::find(patterns.begin(), patterns.end(),
                    arrangement["workPatternId"]) == patterns.end())
        continue;
    }
    auto members = select(v["selector"], d, {}, p);
    if (std::find(members.begin(), members.end(), e) == members.end())
      continue;
    int rank = v["priority"];
    if (rank < priority)
      continue;
    if (rank == priority)
      throw Error("VARIANT_AMBIGUITY", "/shifts/variants",
                  "Equal-priority variants apply to " + employees[e].id +
                      " on " + date(d));
    selected = v;
    priority = rank;
  }
  return selected;
}
std::vector<int> Scenario::domain(int e, int d,
                                  const std::string &given) const {
  if (!plannable(e, d))
    return {};
  std::string p = given.empty() ? profile(d) : given;
  auto prof = profileDefinition(p),
       arrangement = workPatternAssignment(e, d, p);
  Json pattern = nullptr;
  if (arrangement.contains("workPatternId")) {
    for (auto &definition : source.value("workPatterns", Json::array()))
      if (definition["id"] == arrangement["workPatternId"])
        for (auto &v : definition["versions"])
          if (effective(v, d))
            pattern = v;
    if (pattern.is_null())
      throw Error("WORK_PATTERN_GAP", "/workPatterns",
                  "No effective work pattern for " + employees[e].id + " on " +
                      date(d));
  }
  bool offDay = false;
  if (prof.contains("offWeekdays"))
    offDay = std::find(prof["offWeekdays"].begin(), prof["offWeekdays"].end(),
                       weekday(d)) != prof["offWeekdays"].end();
  if (prof.value("holidayMode", "NORMAL") == "OFF" && !holiday(d).empty())
    offDay = true;
  std::vector<int> result;
  for (size_t t = 0; t < shifts.size(); ++t) {
    auto &sh = shifts[t];
    bool yes = !offDay || sh.kind == "OFF";
    if (prof.contains("shiftIds"))
      yes &= std::find(prof["shiftIds"].begin(), prof["shiftIds"].end(),
                       sh.id) != prof["shiftIds"].end();
    if (!pattern.is_null()) {
      Json permitted = pattern["shiftIds"];
      bool workday =
          std::find(pattern["weekdays"].begin(), pattern["weekdays"].end(),
                    weekday(d)) != pattern["weekdays"].end();
      for (auto &x : pattern.value("exceptions", Json::array()))
        if (day(x["date"]) == d) {
          permitted = x["shiftIds"];
          workday = true;
        }
      yes &= std::find(permitted.begin(), permitted.end(), sh.id) !=
                 permitted.end() &&
             (workday || sh.kind == "OFF");
    }
    for (auto &r : source["allowedShifts"])
      if (matches(r, d, p)) {
        auto members = select(r["selector"], d, {}, p);
        if (std::find(members.begin(), members.end(), e) != members.end()) {
          bool permitted = std::find(r["shiftIds"].begin(), r["shiftIds"].end(),
                                     sh.id) != r["shiftIds"].end();
          if (r.value("allowRequiredRest", false) && sh.kind == "OFF")
            permitted = true;
          yes &= permitted;
        }
      }
    auto resolved = intervals(e, d, int(t), p);
    if (resolved.is_null()) {
      yes = false;
      continue;
    }
    for (auto &i : resolved["intervals"])
      if (i["endDayOffset"] == 1 && i["end"] != "00:00" &&
          (excluded(d + 1) || closed(e, d + 1) || absent(e, d + 1) ||
           !active(e, d + 1)))
        yes = false;
    if (yes)
      result.push_back(int(t));
  }
  return result;
}
std::vector<int> Scenario::allowed(int e, int d) const {
  if (selectedWeeks.contains(isoMonday(d)))
    return domain(e, d, profile(d));
  std::set<int> result;
  for (auto &p : weekOptions(d).value("profileIds", Json::array())) {
    auto list = domain(e, d, p);
    result.insert(list.begin(), list.end());
  }
  return {result.begin(), result.end()};
}
std::vector<Json> Scenario::duties() const {
  auto list =
      source.value("dutyRequirements", Json::array()).get<std::vector<Json>>();
  for (auto &p : activePolicies)
    for (auto r : p.value("dutyRequirements", Json::array())) {
      r["_policyScope"] = p.value("scope", Json::object());
      if (p.contains("_profileIds"))
        r["_profileIds"] = p["_profileIds"];
      list.push_back(r);
    }
  return list;
}
std::vector<Json> Scenario::transitions() const {
  auto list =
      source.value("temporalRules", Json::array()).get<std::vector<Json>>();
  for (auto &p : activePolicies)
    for (auto r : p.value("temporalRules", Json::array())) {
      r["_policyScope"] = p.value("scope", Json::object());
      if (p.contains("_profileIds"))
        r["_profileIds"] = p["_profileIds"];
      list.push_back(r);
    }
  return list;
}
static int minutes(const Json &j) {
  auto t = j.get<std::string>();
  return std::stoi(t.substr(0, 2)) * 60 + std::stoi(t.substr(3, 2));
}
std::vector<std::pair<int64_t, int64_t>> spans(const Scenario &s, int e, int d,
                                               int t, const std::string &p) {
  auto resolved = s.intervals(e, d, t, p);
  std::vector<std::pair<int64_t, int64_t>> result;
  if (resolved.is_null())
    return result;
  bool elapsed = false;
  for (auto &r : s.transitions())
    elapsed |= r["type"] == "MIN_REST";
  for (auto &i : resolved["intervals"]) {
    int a = minutes(i["start"]),
        b = minutes(i["end"]) + 1440 * i["endDayOffset"].get<int>();
    if (elapsed)
      result.emplace_back(instant(s.source["calendar"]["timezone"], d, a,
                                  i.value("startFold", -1)),
                          instant(s.source["calendar"]["timezone"], d, b,
                                  i.value("endFold", -1)));
    else
      result.emplace_back(int64_t(d) * 1440 + a, int64_t(d) * 1440 + b);
  }
  std::sort(result.begin(), result.end());
  return result;
}
bool temporalCompatible(const Scenario &s, int e, int d, int t, int nextDate,
                        int nextShift, const std::string &p,
                        const std::string &q) {
  auto first = spans(s, e, d, t, p),
       second = spans(s, e, nextDate, nextShift, q);
  for (auto &a : first)
    for (auto &b : second)
      if (std::max(a.first, b.first) < std::min(a.second, b.second))
        return false;
  for (auto &r : s.transitions()) {
    if (!s.matches(r, d, p) ||
        (r["type"] != "MIN_REST" && nextDate != d + r["offsetDays"].get<int>()))
      continue;
    auto members = s.select(r["selector"], d, {}, p);
    if (std::find(members.begin(), members.end(), e) == members.end())
      continue;
    auto &from = r["fromShiftIds"];
    auto &to = r["toShiftIds"];
    bool isFrom = from.empty() || std::find(from.begin(), from.end(),
                                            s.shifts[t].id) != from.end(),
         isTo = to.empty() || std::find(to.begin(), to.end(),
                                        s.shifts[nextShift].id) != to.end();
    if (!isFrom)
      continue;
    if (r["type"] == "SUCCESSION" && !isTo)
      return false;
    if (r["type"] == "FORBIDDEN_PAIR" && isTo)
      return false;
    if (r["type"] == "MIN_REST" && isTo && !first.empty() && !second.empty() &&
        second.front().first - first.back().second <
            r["minimumMinutes"].get<int>())
      return false;
  }
  return true;
}
} // namespace rostercore

namespace rostercore {
std::vector<std::pair<int64_t, int64_t>>
requirementSpans(const Scenario &s, const Json &r, int d) {
  std::vector<std::pair<int64_t, int64_t>> out;
  bool elapsed = false;
  for (auto &t : s.transitions())
    elapsed |= t["type"] == "MIN_REST";
  for (auto &i : r["intervals"]) {
    int a = minutes(i["start"]),
        b = minutes(i["end"]) + 1440 * i["endDayOffset"].get<int>();
    if (elapsed)
      out.emplace_back(instant(s.source["calendar"]["timezone"], d, a,
                               i.value("startFold", -1)),
                       instant(s.source["calendar"]["timezone"], d, b,
                               i.value("endFold", -1)));
    else
      out.emplace_back(int64_t(d) * 1440 + a, int64_t(d) * 1440 + b);
  }
  return out;
}
std::vector<CoverageCandidate> coverageCandidates(const Scenario &s,
                                                  const Json &r, int d,
                                                  const std::string &p) {
  std::vector<CoverageCandidate> result;
  auto required = requirementSpans(s, r, d);
  for (size_t e = 0; e < s.employees.size(); ++e) {
    int level = -1;
    for (auto &l : r["levels"]) {
      auto members = s.select(l["selector"], d, {}, p);
      if (std::find(members.begin(), members.end(), int(e)) != members.end() &&
          (level < 0 || l["level"].get<int>() < level))
        level = l["level"];
    }
    if (level < 0)
      continue;
    for (int start = d - (r["mode"] == "PRESENCE" ? 1 : 0); start <= d;
         ++start) {
      if (start < s.days.front() &&
          std::none_of(
              s.source["history"]["assignments"].begin(),
              s.source["history"]["assignments"].end(),
              [&](const Json &a) {
                return a["employeeId"] == s.employees[e].id &&
                       day(a["date"]) == start;
              }))
        continue;
      for (auto &q : s.weekOptions(start).value("profileIds", Json::array())) {
        std::string profileId = q;
        if (isoMonday(start) == isoMonday(d) && profileId != p)
          continue;
        for (size_t t = 0; t < s.shifts.size(); ++t) {
          if (s.shifts[t].kind != "WORKING" && r["mode"] == "PRESENCE")
            continue;
          auto &ids = r["shiftIds"];
          if (!ids.empty() &&
              std::find(ids.begin(), ids.end(), s.shifts[t].id) == ids.end())
            continue;
          auto concrete = s.intervals(int(e), start, int(t), profileId);
          if (concrete.is_null())
            continue;
          auto ranges = spans(s, int(e), start, int(t), profileId);
          bool qualified = true;
          if (r["mode"] == "RESPONSIBILITY")
            for (auto &range : required) {
              int64_t cursor = range.first;
              for (auto &span : ranges)
                if (span.first <= cursor && span.second > cursor)
                  cursor = span.second;
              if (cursor < range.second)
                qualified = false;
            }
          else {
            qualified = false;
            for (auto &a : required)
              for (auto &b : ranges)
                if (std::max(a.first, b.first) < std::min(a.second, b.second))
                  qualified = true;
          }
          if (qualified)
            result.push_back({int(e), start, int(t), level, profileId, ranges});
        }
      }
    }
  }
  return result;
}
} // namespace rostercore
