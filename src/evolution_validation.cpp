#include "rostercore/core.hpp"
#include <algorithm>
#include <functional>
namespace rostercore {
void validateEvolution(const Json &j, bool workforceOnly) {
  auto error = [](std::string code, std::string path, std::string message) {
    throw Error(code, path, message);
  };
  auto registry = [&](const Json &items, std::string path) {
    std::set<std::string> ids;
    for (auto &x : items)
      if (!ids.insert(x["id"]).second)
        error("DUPLICATE_ID", path,
              "Duplicate ID: " + x["id"].get<std::string>());
    return ids;
  };
  auto array = [&](const char *key) { return j.value(key, Json::array()); };
  auto attrs = registry(array("attributeDefinitions"), "/attributeDefinitions"),
       patterns = registry(array("workPatterns"), "/workPatterns"),
       profiles = registry(array("weekProfiles"), "/weekProfiles");
  auto refs = [&](const std::set<std::string> &ids, const Json &values,
                  std::string path) {
    for (auto &id : values)
      if (!ids.contains(id.get<std::string>()))
        error("REFERENCE", path, "Unknown reference: " + id.get<std::string>());
  };
  auto groups = registry(j["groups"], "/groups");
  auto types = registry(j["employeeTypes"], "/employeeTypes"),
       shifts = registry(j["shifts"], "/shifts"),
       employees = registry(j["employees"], "/employees"),
       rules = registry(j["constraints"], "/constraints"),
       policies = registry(j["policies"], "/policies");
  auto validRange = [&](const Json &x, std::string path) {
    if (x.contains("validFrom"))
      day(x["validFrom"]);
    if (x.contains("validTo"))
      day(x["validTo"]);
    if (x.contains("validFrom") && x.contains("validTo") &&
        day(x["validTo"]) <= day(x["validFrom"]))
      error(
          "DATE_RANGE", path,
          "Effective intervals use [validFrom, validTo) and must be positive");
  };
  auto timeline = [&](const Json &xs, std::string path, bool monday) {
    std::vector<std::pair<int, int>> ranges;
    for (auto &x : xs) {
      validRange(x, path);
      int a = day(x["validFrom"]),
          b = x.contains("validTo") ? day(x["validTo"]) : 1000000;
      if (monday &&
          (weekday(a) != 1 || (x.contains("validTo") && weekday(b) != 1)))
        error("WEEK_ALIGNMENT", path,
              "Recurrence/automatic effective boundaries must be ISO Mondays");
      ranges.emplace_back(a, b);
    }
    std::sort(ranges.begin(), ranges.end());
    for (size_t i = 1; i < ranges.size(); ++i)
      if (ranges[i].first < ranges[i - 1].second)
        error("TEMPORAL_OVERLAP", path, "Effective intervals overlap");
  };
  auto valueType = [&](const Json &definition, const Json &value) {
    std::string type = definition["type"];
    if (value.is_null())
      return;
    bool ok = type == "STRING"    ? value.is_string()
              : type == "BOOLEAN" ? value.is_boolean()
              : type == "INTEGER" ? value.is_number_integer()
              : type == "NUMBER"
                  ? value.is_number()
                  : definition.contains("values") &&
                        std::find(definition["values"].begin(),
                                  definition["values"].end(),
                                  value) != definition["values"].end();
    if (!ok)
      error("ATTRIBUTE_TYPE", "/attributeDefinitions",
            "Value has the wrong type or is outside the allowed enumeration: " +
                definition["id"].get<std::string>());
  };
  for (auto &a : array("attributeDefinitions")) {
    validRange(a, "/attributeDefinitions");
    if (a["type"] == "ENUM" && (!a.contains("values") || a["values"].empty()))
      error("ATTRIBUTE_TYPE", "/attributeDefinitions",
            "An enumeration requires allowed values");
    if (a.contains("default"))
      valueType(a, a["default"]);
  }
  auto checkAttrs = [&](const Json &values) {
    for (auto &a : array("attributeDefinitions"))
      if (values.contains(a["id"].get<std::string>()))
        valueType(a, values[a["id"].get<std::string>()]);
  };
  for (auto &e : j["employees"]) {
    refs(types, Json::array({e["typeId"]}), "/employees/typeId");
    checkAttrs(e["attributes"]);
    if (e.contains("employment"))
      validRange(e["employment"], "/employees/employment");
    if (e.contains("workPatternId"))
      refs(patterns, Json::array({e["workPatternId"]}),
           "/employees/workPatternId");
    auto versions = e.value("versions", Json::array());
    timeline(versions, "/employees/versions", false);
    for (auto &v : versions) {
      if (v.contains("typeId"))
        refs(types, Json::array({v["typeId"]}), "/employees/versions/typeId");
      if (v.contains("workPatternId") && !v["workPatternId"].is_null())
        refs(patterns, Json::array({v["workPatternId"]}),
             "/employees/versions/workPatternId");
      if (v.contains("attributes"))
        checkAttrs(v["attributes"]);
    }
  }
  auto assignments = array("workPatternAssignmentRules");
  if (j["schemaVersion"].get<int>() < 3) {
    bool needs3 = j.contains("workPatternAssignmentRules");
    for (auto &e : j["employees"])
      for (auto &v : e.value("versions", Json::array()))
        needs3 |= v.contains("workPatternId") && v["workPatternId"].is_null();
    if (needs3)
      error("SCHEMA_VERSION", "/schemaVersion",
            "Automatic work-pattern rules and explicit automatic temporal "
            "overrides require schema version 3; migrate explicitly");
  }
  registry(assignments, "/workPatternAssignmentRules");
  for (auto &r : assignments) {
    validRange(r, "/workPatternAssignmentRules");
    refs(patterns, Json::array({r["workPatternId"]}),
         "/workPatternAssignmentRules/workPatternId");
  }
  for (auto &p : array("workPatterns")) {
    timeline(p["versions"], "/workPatterns/versions", false);
    for (auto &v : p["versions"]) {
      refs(shifts, v["shiftIds"], "/workPatterns/versions/shiftIds");
      std::set<int> dayOverrides;
      for (auto &byDay : v.value("weekdayShifts", Json::array())) {
        if (j["schemaVersion"].get<int>() < 4)
          error("SCHEMA_VERSION", "/workPatterns",
                "Weekday overrides require schema 4");
        if (!dayOverrides.insert(byDay["weekday"].get<int>()).second)
          error("DUPLICATE_WEEKDAY", "/workPatterns/versions/weekdayShifts",
                "A weekday can have only one override");
        refs(shifts, byDay["shiftIds"], "/workPatterns/versions/weekdayShifts");
      }
      for (auto &x : v.value("exceptions", Json::array())) {
        day(x["date"]);
        refs(shifts, x["shiftIds"], "/workPatterns/exceptions");
      }
    }
  }
  std::function<void(const Json &, int)> where = [&](const Json &x, int depth) {
    if (depth > 32)
      error("AST_LIMIT", "/selector/where",
            "Selector predicate exceeds depth 32");
    std::string op = x["op"];
    if (op == "AND" || op == "OR") {
      for (auto &c : x["children"])
        where(c, depth + 1);
      return;
    }
    if (op == "NOT") {
      where(x["child"], depth + 1);
      return;
    }
    refs(attrs, Json::array({x["attributeId"]}), "/selector/where/attributeId");
    for (auto &a : array("attributeDefinitions"))
      if (a["id"] == x["attributeId"]) {
        if (x.contains("value"))
          valueType(a, x["value"]);
        if (x.contains("values"))
          for (auto &v : x["values"])
            valueType(a, v);
        if ((op == "LT" || op == "LE" || op == "GT" || op == "GE") &&
            a["type"] != "NUMBER" && a["type"] != "INTEGER")
          error("ATTRIBUTE_TYPE", "/selector/where",
                "Ordered comparisons require numeric attributes");
      }
  };
  std::function<void(const Json &, bool)> walk = [&](const Json &x,
                                                     bool draft) {
    if (x.is_object()) {
      if (x.contains("draft") && x["draft"].is_boolean() &&
          x["draft"].get<bool>())
        draft = true;
      if (!draft && x.contains("selector") && x["selector"].is_object()) {
        auto &sel = x["selector"];
        if (sel.contains("where"))
          where(sel["where"], 0);
        if (sel.contains("employeeIds"))
          refs(employees, sel["employeeIds"], "/selector/employeeIds");
        if (sel.contains("typeIds"))
          refs(types, sel["typeIds"], "/selector/typeIds");
        if (sel.contains("groupIds"))
          refs(groups, sel["groupIds"], "/selector/groupIds");
      }
      if (x.contains("scope") && x["scope"].is_object() &&
          x["scope"].contains("weekProfileIds") && !draft)
        refs(profiles, x["scope"]["weekProfileIds"], "/scope/weekProfileIds");
      for (auto it = x.begin(); it != x.end(); ++it)
        walk(it.value(), draft);
    } else if (x.is_array())
      for (auto &v : x)
        walk(v, draft);
  };
  if (workforceOnly) {
    Json workforce = Json::object();
    for (auto key : {"employees", "groups", "attributeDefinitions",
                     "workPatterns", "workPatternAssignmentRules"})
      if (j.contains(key))
        workforce[key] = j[key];
    walk(workforce, false);
    Scenario scenario(j);
    for (auto &g : j["groups"])
      scenario.select(g["selector"]);
    return;
  }
  for (auto &p : array("weekProfiles")) {
    refs(rules, p["constraintIds"], "/weekProfiles/constraintIds");
    refs(policies, p["policyIds"], "/weekProfiles/policyIds");
    if (p.contains("shiftIds"))
      refs(shifts, p["shiftIds"], "/weekProfiles/shiftIds");
  }
  auto config = j.value("weekConfiguration", Json::object());
  auto recurrences = config.value("recurrences", Json::array());
  registry(recurrences, "/weekConfiguration/recurrences");
  timeline(recurrences, "/weekConfiguration/recurrences", true);
  for (auto &r : recurrences) {
    day(r["anchor"]);
    refs(profiles, r["sequence"], "/weekConfiguration/recurrences/sequence");
  }
  if (config.contains("defaultProfileId"))
    refs(profiles, Json::array({config["defaultProfileId"]}),
         "/weekConfiguration/defaultProfileId");
  if (config.contains("automatic")) {
    auto &a = config["automatic"];
    validRange(a, "/weekConfiguration/automatic");
    timeline(Json::array({a}), "/weekConfiguration/automatic", true);
    refs(profiles, a["profileIds"], "/weekConfiguration/automatic/profileIds");
  }
  auto frequencies = config.value("frequencies", Json::array());
  auto frequencyIds = registry(frequencies, "/weekConfiguration/frequencies");
  for (auto &f : frequencies) {
    refs(profiles, Json::array({f["profileId"]}),
         "/weekConfiguration/frequencies");
    if ((f.contains("minCount") || f.contains("maxCount") ||
         f.contains("desiredCount")) &&
        !f.contains("windowWeeks"))
      error("FREQUENCY", "/weekConfiguration/frequencies",
            "Count frequencies require windowWeeks");
    if (f.contains("minGapWeeks") && f.contains("maxGapWeeks") &&
        f["minGapWeeks"].get<int>() > f["maxGapWeeks"].get<int>())
      error("FREQUENCY", "/weekConfiguration/frequencies",
            "minGapWeeks exceeds maxGapWeeks");
    for (auto key :
         {"windowWeeks", "maxGapWeeks", "minGapWeeks", "desiredGapWeeks"})
      if (f.value(key, 1) > 104)
        error("SIZE_LIMIT", "/weekConfiguration/frequencies",
              "Weekly frequency windows are limited to 104 weeks");
  }
  std::set<int> historyWeeks;
  for (auto &h : config.value("history", Json::array())) {
    int w = isoMonday(day(h["week"]));
    if (!historyWeeks.insert(w).second)
      error("WEEK_CONFLICT", "/weekConfiguration/history",
            "Duplicate consolidated week");
    refs(profiles, Json::array({h["profileId"]}), "/weekConfiguration/history");
  }
  for (auto &m : config.value("manual", Json::array())) {
    day(m["week"]);
    refs(profiles, Json::array({m["profileId"]}), "/weekConfiguration/manual");
    refs(frequencyIds, m["waiveFrequencyIds"],
         "/weekConfiguration/manual/waiveFrequencyIds");
    if ((m["overrideRecurrence"].get<bool>() ||
         !m["waiveFrequencyIds"].empty()) &&
        m["reason"].get<std::string>().empty())
      error("WEEK_OVERRIDE_REQUIRED", "/weekConfiguration/manual",
            "An override or frequency waiver requires a reason");
  }
  walk(j, false);
  auto intervals = [&](const Json &xs, bool off) {
    if (off && !xs.empty())
      error("SHIFT_INTERVALS", "/shifts",
            "OFF variants cannot contain working intervals");
    std::vector<std::pair<int, int>> spans;
    for (auto &i : xs) {
      auto minute = [](std::string v) {
        return std::stoi(v.substr(0, 2)) * 60 + std::stoi(v.substr(3, 2));
      };
      int a = minute(i["start"]),
          b = minute(i["end"]) + 1440 * i["endDayOffset"].get<int>();
      if (b <= a || b - a > 1440)
        error("SHIFT_INTERVALS", "/shifts/variants",
              "Intervals require positive duration, at most 24 civil hours");
      spans.emplace_back(a, b);
    }
    std::sort(spans.begin(), spans.end());
    for (size_t k = 1; k < spans.size(); ++k)
      if (spans[k].first < spans[k - 1].second)
        error("SHIFT_INTERVALS", "/shifts/variants",
              "Variant intervals overlap");
  };
  for (auto &shift : j["shifts"]) {
    registry(shift.value("variants", Json::array()), "/shifts/variants");
    for (auto &v : shift.value("variants", Json::array())) {
      intervals(v["intervals"], shift["kind"] == "OFF");
      if (shift["kind"] == "WORKING" && v["intervals"].empty())
        error("SHIFT_INTERVALS", "/shifts/variants",
              "Working variants require intervals");
      if (v.contains("workPatternIds"))
        refs(patterns, v["workPatternIds"], "/shifts/variants/workPatternIds");
    }
  }
  registry(j["calendar"].value("closures", Json::array()),
           "/calendar/closures");
  for (auto &c : j["calendar"].value("closures", Json::array()))
    validRange(c, "/calendar/closures");
  if (j.contains("replanning")) {
    day(j["replanning"]["from"]);
    std::set<std::pair<std::string, std::string>> seen;
    for (auto &a : j["replanning"]["baseline"]) {
      day(a["date"]);
      refs(employees, Json::array({a["employeeId"]}), "/replanning/baseline");
      refs(shifts, Json::array({a["shiftId"]}), "/replanning/baseline");
      if (!seen.emplace(a["employeeId"], a["date"]).second)
        error("DUPLICATE_ASSIGNMENT", "/replanning/baseline",
              "Duplicate baseline assignment");
    }
  }
  Scenario scenario(j);
  for (int w : scenario.weeks())
    scenario.weekOptions(w);
  for (int d : scenario.days)
    scenario.holiday(d);
  registry(scenario.duties(), "/dutyRequirements");
  for (auto &r : scenario.duties()) {
    refs(shifts, r["shiftIds"], "/dutyRequirements/shiftIds");
    intervals(r["intervals"], false);
    if (r["mode"] == "PRESENCE" && r["intervals"].empty())
      error("COVERAGE_INTERVALS", "/dutyRequirements/intervals",
            "PRESENCE requires actual intervals");
    std::set<int> levels;
    for (auto &l : r["levels"])
      if (!levels.insert(l["level"].get<int>()).second)
        error("COVERAGE_LEVEL", "/dutyRequirements/levels",
              "Preference levels must be unique");
  }
  registry(array("spacingRules"), "/spacingRules");
  for (auto &r : array("spacingRules")) {
    if (j["schemaVersion"].get<int>() < 4)
      error("SCHEMA_VERSION", "/spacingRules", "Spacing requires schema 4");
    refs(shifts, r["shiftIds"], "/spacingRules/shiftIds");
    refs(shifts, r["normalShiftIds"], "/spacingRules/normalShiftIds");
    if (r["shiftIds"].empty() && r.value("fairnessTags", Json::array()).empty())
      error("SPACING_TARGET", "/spacingRules",
            "Select at least one burden shift or shared fairness tag");
    if (r["unit"] == "NORMAL_WORK_DAYS" && r["normalShiftIds"].empty())
      error("SPACING_NORMAL", "/spacingRules/normalShiftIds",
            "Explicit normal WORKING shifts are required");
    for (size_t t = 0; t < scenario.shifts.size(); ++t)
      if (std::find(r["normalShiftIds"].begin(), r["normalShiftIds"].end(),
                    scenario.shifts[t].id) != r["normalShiftIds"].end() &&
          (scenario.shifts[t].kind != "WORKING" ||
           targetShift(scenario, r, int(t))))
        error("SPACING_NORMAL", "/spacingRules/normalShiftIds",
              "Normal shifts must be WORKING and separate from the burden "
              "category");
    for (int d : scenario.days)
      scenario.select(r["selector"], d);
  }
  for (auto &r : scenario.transitions()) {
    refs(shifts, r["fromShiftIds"], "/temporalRules/fromShiftIds");
    refs(shifts, r["toShiftIds"], "/temporalRules/toShiftIds");
    if (r["type"] == "MIN_REST") {
      if (!r.contains("minimumMinutes"))
        error("TEMPORAL_RULE", "/temporalRules",
              "MIN_REST requires minimumMinutes");
      if (r["minimumMinutes"].get<int>() > 20160)
        error("SIZE_LIMIT", "/temporalRules/minimumMinutes",
              "Minimum rest is limited to fourteen days");
      std::string zone = j["calendar"]["timezone"];
      if (zone != "UTC" && !catalogues()["timezones"].contains(zone))
        error("UNSUPPORTED_TIMEZONE", "/calendar/timezone",
              "Elapsed-time rules support UTC and Europe/Rome only");
    }
  }
  for (auto section : {"publishedAssignments", "history"}) {
    auto protectedRecords = std::string(section) == "history"
                                ? j["history"]["assignments"]
                                : j["publishedAssignments"];
    for (auto &a : protectedRecords)
      for (size_t e = 0; e < scenario.employees.size(); ++e)
        if (a["employeeId"] == scenario.employees[e].id)
          for (size_t t = 0; t < scenario.shifts.size(); ++t)
            if (a["shiftId"] == scenario.shifts[t].id &&
                scenario.shifts[t].kind == "WORKING") {
              int d = day(a["date"]);
              bool conflict = scenario.closed(int(e), d);
              auto actual = a.value("intervals", scenario.shifts[t].intervals);
              for (auto &i : actual)
                if (i["endDayOffset"] == 1 && i["end"] != "00:00" &&
                    scenario.closed(int(e), d + 1))
                  conflict = true;
              if (conflict)
                error("CLOSURE_PROTECTED_CONFLICT", "/calendar/closures",
                      "Closure conflicts with protected work: " +
                          a["employeeId"].get<std::string>() + " " + date(d));
            }
  }
  for (int d : scenario.days)
    for (size_t e = 0; e < scenario.employees.size(); ++e)
      if (scenario.active(int(e), d))
        for (auto &p :
             scenario.weekOptions(d).value("profileIds", Json::array())) {
          scenario.workPatternAssignment(int(e), d, p);
          for (size_t t = 0; t < scenario.shifts.size(); ++t) {
            auto v = scenario.intervals(int(e), d, int(t), p);
            (void)v;
          }
        }
}
} // namespace rostercore
