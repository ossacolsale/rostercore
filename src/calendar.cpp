#include "catalogues.hpp"
#include "rostercore/core.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
namespace rostercore {
const Json &catalogues() {
  static const auto value = Json::parse(rostercore_catalogue_json);
  return value;
}
int isoMonday(int d) { return d + 1 - weekday(d); }
bool effective(const Json &j, int d) {
  return (!j.contains("validFrom") || d >= day(j["validFrom"])) &&
         (!j.contains("validTo") || d < day(j["validTo"]));
}
std::vector<int> Scenario::weeks() const {
  std::vector<int> result;
  for (int w = isoMonday(days.front()); w <= days.back(); w += 7)
    result.push_back(w);
  return result;
}
Json Scenario::weekOptions(int d) const {
  int w = isoMonday(d);
  auto config = source.value("weekConfiguration", Json::object());
  Json ids = Json::array();
  std::string origin = "LEGACY", derived;
  for (auto &h : config.value("history", Json::array()))
    if (isoMonday(day(h["week"])) == w) {
      ids.push_back(h["profileId"]);
      origin = "HISTORY";
    }
  for (auto &r : config.value("recurrences", Json::array()))
    if (effective(r, w)) {
      if (!derived.empty())
        throw Error("WEEK_CONFLICT", "/weekConfiguration/recurrences",
                    "Recurrences overlap on " + date(w));
      int anchor = isoMonday(day(r["anchor"])), n = int(r["sequence"].size()),
          index = ((w - anchor) / 7 % n + n) % n;
      derived = r["sequence"][index];
    }
  Json manual = nullptr;
  for (auto &m : config.value("manual", Json::array()))
    if (isoMonday(day(m["week"])) == w) {
      if (!manual.is_null())
        throw Error("WEEK_CONFLICT", "/weekConfiguration/manual",
                    "More than one manual profile for " + date(w));
      manual = m;
    }
  if (!manual.is_null()) {
    std::string id = manual["profileId"];
    if (!ids.empty() && ids[0] != id)
      throw Error("HISTORY_PROTECTED", "/weekConfiguration/manual",
                  "Cannot change a consolidated ISO week: " + date(w));
    if (!derived.empty() && id != derived &&
        !manual["overrideRecurrence"].get<bool>())
      throw Error("WEEK_OVERRIDE_REQUIRED", "/weekConfiguration/manual",
                  "Explicit recurrence override authorization required for " +
                      date(w));
    if (ids.empty()) {
      ids.push_back(id);
      origin = "MANUAL";
    }
  }
  if (ids.empty() && !derived.empty()) {
    ids.push_back(derived);
    origin = "RECURRENCE";
  }
  if (ids.empty() && config.contains("automatic") &&
      effective(config["automatic"], w)) {
    ids = config["automatic"]["profileIds"];
    origin = "OPTIMIZATION";
  }
  if (ids.empty() && config.contains("defaultProfileId")) {
    ids.push_back(config["defaultProfileId"]);
    origin = "DEFAULT";
  }
  if (ids.empty()) {
    if (!source.value("weekProfiles", Json::array()).empty())
      throw Error("WEEK_UNCLASSIFIED", "/weekConfiguration",
                  "No profile classifies ISO week " + date(w));
    ids.push_back("");
  }
  return {{"week", date(w)},
          {"isoWeek", isoWeek(w)},
          {"profileIds", ids},
          {"origin", origin}};
}
std::string Scenario::profile(int d) const {
  int w = isoMonday(d);
  if (selectedWeeks.contains(w))
    return selectedWeeks.at(w);
  auto ids = weekOptions(d)["profileIds"];
  return ids.size() == 1 ? ids[0].get<std::string>() : "";
}
Json Scenario::profileDefinition(const std::string &id) const {
  for (auto &p : source.value("weekProfiles", Json::array()))
    if (p["id"] == id)
      return p;
  return Json::object();
}
Json Scenario::holiday(int d) const {
  auto &calendar = source["calendar"];
  Json reasons = Json::array();
  if (!calendar.contains("holidays"))
    return reasons;
  auto &settings = calendar["holidays"];
  auto &cat = catalogues()["italianHolidays"];
  if (date(d) < cat["validFrom"].get<std::string>() ||
      date(d) >= cat["validTo"].get<std::string>())
    throw Error("HOLIDAY_RANGE", "/calendar/holidays",
                "Italian holiday catalogue supports 2001–2200");
  auto civil =
      std::chrono::year_month_day(std::chrono::sys_days(std::chrono::days(d)));
  int y = int(civil.year()), month = int(unsigned(civil.month())),
      dom = int(unsigned(civil.day()));
  for (auto &rule : cat["fixed"])
    if (rule["month"] == month && rule["day"] == dom && effective(rule, d))
      reasons.push_back(
          {{"id", rule["id"]},
           {"label", rule["label"]},
           {"source", rule.value("source", cat["source"].get<std::string>())}});
  int a = y % 19, b = y / 100, c = y % 100, g = (b - (b + 8) / 25 + 1) / 3,
      h = (19 * a + b - b / 4 - g + 15) % 30,
      l = (32 + 2 * (b % 4) + 2 * (c / 4) - h - c % 4) % 7,
      m = (a + 11 * h + 22 * l) / 451, eMonth = (h + l - 7 * m + 114) / 31,
      eDay = (h + l - 7 * m + 114) % 31 + 1;
  char value[16];
  std::snprintf(value, sizeof(value), "%04d-%02d-%02d", y, eMonth, eDay);
  if (d == day(value) + 1)
    reasons.push_back({{"id", "it.easter_monday"},
                       {"label", "Easter Monday"},
                       {"source", cat["source"]}});
  for (auto &local : settings["localDates"])
    if (day(local["date"]) == d) {
      if (!local["holiday"].get<bool>())
        reasons = Json::array();
      else
        reasons.push_back({{"id", "local"}, {"label", local["label"]}});
    }
  return reasons;
}
bool Scenario::matches(const Json &item, int d,
                       const std::string &given) const {
  if (!applies(item, d))
    return false;
  std::string selected = given.empty() ? profile(d) : given;
  for (auto key : {"scope", "_policyScope"}) {
    auto scope = item.value(key, Json::object());
    if (scope.contains("weekProfileIds")) {
      auto &ids = scope["weekProfileIds"];
      if (std::find(ids.begin(), ids.end(), selected) == ids.end())
        return false;
    }
    auto kind = scope.value("dayType", "ANY");
    if (kind == "HOLIDAY" && holiday(d).empty())
      return false;
    if (kind == "NON_HOLIDAY" && !holiday(d).empty())
      return false;
  }
  if (item.contains("_profileIds") && !item["_profileIds"].empty()) {
    auto &ids = item["_profileIds"];
    if (std::find(ids.begin(), ids.end(), selected) == ids.end())
      return false;
  }
  return true;
}
Json migrate(const Json &j) {
  validate(j);
  Json updated = j;
  updated["schemaVersion"] = 3;
  for (auto key :
       {"attributeDefinitions", "workPatterns", "weekProfiles",
        "dutyRequirements", "temporalRules", "workPatternAssignmentRules"})
    if (!updated.contains(key))
      updated[key] = Json::array();
  if (!updated.contains("weekConfiguration"))
    updated["weekConfiguration"] = {{"manual", Json::array()},
                                    {"recurrences", Json::array()},
                                    {"frequencies", Json::array()},
                                    {"history", Json::array()}};
  if (!updated["calendar"].contains("closures"))
    updated["calendar"]["closures"] = Json::array();
  auto out = response("MIGRATED");
  out["scenario"] = updated;
  out["migration"] = {{"fromSchemaVersion", j["schemaVersion"]},
                      {"toSchemaVersion", 3},
                      {"identifiersPreserved", true},
                      {"historyPreserved", true},
                      {"manualActions", Json::array()}};
  return out;
}
Json inspect(const Json &j, const std::string &onDate) {
  validate(j);
  Scenario s(j);
  int d = day(onDate);
  auto out = response("INSPECTED");
  out["weekAssignments"] = Json::array();
  for (int w : s.weeks())
    out["weekAssignments"].push_back(s.weekOptions(w));
  out["calendarDays"] = Json::array();
  for (int dt : s.days)
    out["calendarDays"].push_back({{"date", date(dt)},
                                   {"week", date(isoMonday(dt))},
                                   {"profileId", s.profile(dt)},
                                   {"holidays", s.holiday(dt)},
                                   {"excluded", s.excluded(dt)}});
  out["workforce"] = {{"date", onDate}, {"employees", Json::array()}};
  for (size_t e = 0; e < s.employees.size(); ++e)
    out["workforce"]["employees"].push_back(
        {{"employeeId", s.employees[e].id},
         {"label", s.employees[e].label},
         {"active", s.active(int(e), d)},
         {"state", s.employeeState(int(e), d)},
         {"attributes", s.resolvedAttributes(int(e), d)}});
  for (size_t e = 0; e < s.employees.size(); ++e) {
    auto &person = out["workforce"]["employees"][e];
    person["workPatternAssignment"] =
        s.workPatternAssignment(int(e), d, s.profile(d));
    if (person["workPatternAssignment"].contains("workPatternId"))
      person["state"]["workPatternId"] =
          person["workPatternAssignment"]["workPatternId"];
    else
      person["state"].erase("workPatternId");
    person["groups"] = Json::array();
    for (auto &g : j["groups"]) {
      auto members = s.select(g["selector"], d);
      if (std::find(members.begin(), members.end(), int(e)) != members.end())
        person["groups"].push_back(g["id"]);
    }
    person["shifts"] = Json::array();
    for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
      std::string p = pj;
      auto allowed = s.domain(int(e), d, p);
      for (size_t t = 0; t < s.shifts.size(); ++t) {
        auto concrete = s.intervals(int(e), d, int(t), p);
        if (!concrete.is_null())
          person["shifts"].push_back(
              {{"shiftId", s.shifts[t].id},
               {"variantId", concrete["id"]},
               {"profileId", p},
               {"intervals", concrete["intervals"]},
               {"admissible", std::find(allowed.begin(), allowed.end(),
                                        int(t)) != allowed.end()}});
      }
    }
  }
  return out;
}
Json previewWorkPatterns(const Json &j, const std::string &onDate) {
  validateSchema(j, "scenario");
  validateEvolution(j, true);
  Scenario s(j);
  int d = day(onDate);
  auto out = response("INSPECTED");
  out["workforce"] = {
      {"date", onDate}, {"employees", Json::array()}, {"rules", Json::array()}};
  auto options = s.weekOptions(d).value("profileIds", Json::array());
  for (auto &pid : options) {
    std::string profile = pid;
    for (auto &r : j.value("workPatternAssignmentRules", Json::array())) {
      Json ids = Json::array();
      if (r["enabled"].get<bool>() && effective(r, d))
        for (int e : s.select(r["selector"], d, {}, profile))
          ids.push_back(s.employees[e].id);
      out["workforce"]["rules"].push_back(
          {{"ruleId", r["id"]}, {"profileId", profile}, {"employeeIds", ids}});
    }
    for (size_t e = 0; e < s.employees.size(); ++e) {
      Json resolved;
      try {
        resolved = s.workPatternAssignment(int(e), d, profile);
      } catch (const Error &error) {
        resolved = {{"origin", "CONFLICT"}, {"message", error.what()}};
        out["diagnostics"].push_back(
            {{"code", error.code},
             {"path", error.path},
             {"message", error.what()},
             {"severity", "ERROR"},
             {"section", "contracts"},
             {"objectIds", Json::array({s.employees[e].id})}});
      }
      if (resolved["origin"] == "NONE" &&
          !j.value("workPatternAssignmentRules", Json::array()).empty())
        out["diagnostics"].push_back(
            {{"code", "WORK_PATTERN_UNASSIGNED"},
             {"path", "/workPatternAssignmentRules"},
             {"message", "No work pattern resolves for " + s.employees[e].id +
                             " on " + onDate +
                             "; existing unrestricted behavior applies"},
             {"severity", "WARNING"},
             {"section", "contracts"}});
      auto state = s.employeeState(int(e), d);
      if (resolved.contains("workPatternId"))
        state["workPatternId"] = resolved["workPatternId"];
      else
        state.erase("workPatternId");
      out["workforce"]["employees"].push_back(
          {{"employeeId", s.employees[e].id},
           {"label", s.employees[e].label},
           {"active", s.active(int(e), d)},
           {"profileId", profile},
           {"state", state},
           {"workPatternAssignment", resolved},
           {"attributes", s.resolvedAttributes(int(e), d)},
           {"groups", Json::array()},
           {"shifts", Json::array()}});
    }
  }
  return out;
}
Json configurationDiagnostics(const Json &j) {
  Scenario s(j);
  Json ds = Json::array();
  for (int d : s.days)
    if (!s.holiday(d).empty() &&
        s.profileDefinition(s.profile(d)).value("holidayMode", "NORMAL") ==
            "NORMAL") {
      ds.push_back(
          {{"code", "HOLIDAY_OPERATIONAL"},
           {"path", "/weekProfiles"},
           {"severity", "INFORMATION"},
           {"message",
            "Holiday remains operational under the selected week profile: " +
                date(d)},
           {"section", "weeks"},
           {"suggestion",
            "Review the profile holiday rule if rest is intended."}});
      if (ds.size() >= 8)
        break;
    }
  for (auto key :
       {"groups", "attributeDefinitions", "workPatterns", "weekProfiles"})
    for (auto &item : j.value(key, Json::array())) {
      std::string token = Json(item["id"]).dump(), document = j.dump();
      size_t at = 0;
      int count = 0;
      while ((at = document.find(token, at)) != std::string::npos) {
        ++count;
        at += token.size();
      }
      if (count == 1)
        ds.push_back(
            {{"code", "NO_EXPLICIT_REFERENCE"},
             {"path", std::string("/") + key},
             {"severity", "WARNING"},
             {"message", "No explicit references to catalogue item: " +
                             item["label"].get<std::string>()},
             {"objectIds", Json::array({item["id"]})},
             {"suggestion", "Broad selectors may still include this item. "
                            "Reuse it from the relevant editor."}});
    }
  return ds;
}
int64_t instant(const std::string &zone, int d, int minutes, int fold) {
  int64_t local = int64_t(d) * 1440 + minutes;
  if (zone == "UTC")
    return local;
  auto &zones = catalogues()["timezones"];
  if (!zones.contains(zone))
    throw Error("UNSUPPORTED_TIMEZONE", "/calendar/timezone",
                "Elapsed-time rules support UTC and Europe/Rome only");
  auto &z = zones[zone];
  std::set<int> offsets;
  for (auto &t : z["transitions"])
    offsets.insert(t[1].get<int>());
  std::vector<int64_t> valid;
  for (int offset : offsets) {
    int64_t utc = local - offset;
    if (utc < z["validFromUtcMinute"].get<int64_t>() ||
        utc >= z["validToUtcMinute"].get<int64_t>())
      continue;
    auto &transitions = z["transitions"];
    auto it = std::upper_bound(transitions.begin(), transitions.end(), utc,
                               [](int64_t value, const Json &t) {
                                 return value < t[0].get<int64_t>();
                               });
    int at = it == transitions.begin() ? 0 : (--it)->at(1).get<int>();
    if (at == offset)
      valid.push_back(utc);
  }
  std::sort(valid.begin(), valid.end());
  if (valid.empty())
    throw Error("NONEXISTENT_LOCAL_TIME", "/shifts/intervals",
                "Nonexistent local time or outside offline timezone range: " +
                    date(d));
  if (valid.size() > 1 && fold < 0)
    throw Error("AMBIGUOUS_LOCAL_TIME", "/shifts/intervals",
                "Ambiguous local time requires startFold/endFold (0 earlier, 1 "
                "later): " +
                    date(d));
  return valid.at(valid.size() > 1 ? size_t(fold) : 0);
}
} // namespace rostercore
