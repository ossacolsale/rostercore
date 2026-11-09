#include "rostercore/core.hpp"
#include <algorithm>
namespace rostercore {
void resolveResultWeeks(Scenario &s, const Json &r) {
  std::set<int> seen;
  for (auto &w : r.value("weekAssignments", Json::array())) {
    int monday = isoMonday(day(w["week"]));
    if (!seen.insert(monday).second)
      throw Error("VERIFY_WEEK_PROFILE", "/weekAssignments",
                  "Duplicate weekly assignment");
    auto options = s.weekOptions(monday).value("profileIds", Json::array());
    if (std::find(options.begin(), options.end(), w["profileId"]) ==
        options.end())
      throw Error(
          "VERIFY_WEEK_PROFILE", "/weekAssignments",
          "Chosen profile violates manual/recurrence/history classification");
    if (w.contains("origin") && w["origin"] != s.weekOptions(monday)["origin"])
      throw Error("VERIFY_WEEK_PROFILE", "/weekAssignments",
                  "Week origin does not match the classification");
    s.selectedWeeks[monday] = w["profileId"];
  }
  if (!s.source.value("weekProfiles", Json::array()).empty())
    for (int w : s.weeks())
      if (!seen.contains(w))
        throw Error("VERIFY_WEEK_PROFILE", "/weekAssignments",
                    "Missing weekly profile for " + date(w));
}
static bool actual(const Scenario &s, const Json &as,
                   const CoverageCandidate &c) {
  if (s.profile(c.date) != c.profileId)
    return false;
  for (auto &a : as)
    if (a["employeeId"] == s.employees[c.employee].id &&
        day(a["date"]) == c.date && a["shiftId"] == s.shifts[c.shift].id)
      return true;
  for (auto &a : s.source["history"]["assignments"])
    if (a["employeeId"] == s.employees[c.employee].id &&
        day(a["date"]) == c.date && a["shiftId"] == s.shifts[c.shift].id)
      return true;
  return false;
}
Json scheduleCoverage(const Scenario &s, const Json &assignments,
                      const Json &choices) {
  Json report = Json::array();
  for (auto &r : s.duties())
    for (int d : s.days)
      if (s.operational(d) && s.matches(r, d)) {
        auto p = s.profile(d);
        Json people = Json::array();
        for (auto &c : coverageCandidates(s, r, d, p))
          if (actual(s, assignments, c)) {
            bool chosen = r["mode"] == "PRESENCE";
            if (!chosen)
              for (auto &choice : choices)
                if (choice["requirementId"] == r["id"] &&
                    choice["date"] == date(d) &&
                    choice["employeeId"] == s.employees[c.employee].id &&
                    choice["sourceDate"] == date(c.date) &&
                    choice["shiftId"] == s.shifts[c.shift].id)
                  chosen = true;
            if (chosen)
              people.push_back({{"employeeId", s.employees[c.employee].id},
                                {"date", date(c.date)},
                                {"shiftId", s.shifts[c.shift].id},
                                {"level", c.level},
                                {"substitution", c.level > 0}});
          }
        report.push_back({{"requirementId", r["id"]},
                          {"label", r["label"]},
                          {"date", date(d)},
                          {"people", people}});
      }
  return report;
}
Json fallbackAccounting(const Scenario &s, const Json &result) {
  Json stages = Json::array(), substitutions = Json::array();
  std::map<int, std::set<int>> levels;
  for (auto &r : s.duties())
    for (auto &l : r["levels"])
      if (l["level"].get<int>() > 0)
        levels[r["preferencePriority"].get<int>()].insert(
            l["level"].get<int>());
  bool proved = true;
  int total = 0;
  for (auto &row : result.value("coverage", Json::array()))
    for (auto &person : row["people"])
      if (person["level"].get<int>() > 0) {
        ++total;
        substitutions.push_back({{"date", row["date"]},
                                 {"requirementId", row["requirementId"]},
                                 {"employeeId", person["employeeId"]},
                                 {"level", person["level"]}});
      }
  for (auto &[priority, tiers] : levels)
    for (auto it = tiers.rbegin(); it != tiers.rend(); ++it) {
      std::string pid = "coverage:" + std::to_string(priority),
                  metric = "FALLBACK_LEVEL_" + std::to_string(*it);
      int count = 0;
      for (auto &r : s.duties())
        if (r["preferencePriority"] == priority)
          for (auto &row : result.value("coverage", Json::array()))
            if (row["requirementId"] == r["id"])
              for (auto &p : row["people"])
                count += p["level"].get<int>() >= *it;
      bool optimal = count == 0;
      Json lower = 0, status = "NONNEGATIVE_ZERO_PROOF";
      for (auto &phase : result.value("phases", Json::array()))
        if (phase["policyId"] == pid && phase["metric"] == metric) {
          if (phase.contains("bestBoundScaled"))
            lower = phase["bestBoundScaled"];
          optimal |= phase["status"] == "OPTIMAL" &&
                     phase.value("valueScaled", -1) == count;
          status = phase["status"];
        }
      proved &= optimal;
      stages.push_back({{"policyId", pid},
                        {"metric", metric},
                        {"priority", priority},
                        {"minimumLevel", *it},
                        {"incumbent", count},
                        {"lowerBound", lower},
                        {"provedMinimum", optimal},
                        {"searchStatus", status}});
    }
  for (auto &item : substitutions) {
    item["minimumProved"] = proved;
    item["reasonCode"] = proved ? "GLOBAL_FALLBACK_MINIMUM_PROVED"
                                : "FALLBACK_NECESSITY_UNPROVED";
  }
  return {{"fallback",
           {{"status", proved ? "PROVED_MINIMUM" : "PROVISIONAL"},
            {"totalSubstitutions", total},
            {"stages", stages}}},
          {"substitutions", substitutions}};
}
Json verifyEvolution(const Scenario &s, const Json &result) {
  auto out = response("VERIFIED");
  auto fail = [&](std::string code, std::string message) {
    out["status"] = "MODEL_INVALID";
    out["diagnostics"].push_back({{"code", code},
                                  {"path", "/"},
                                  {"message", message},
                                  {"severity", "ERROR"}});
  };
  auto config = s.source.value("weekConfiguration", Json::object());
  std::map<int, std::string> chosen = s.selectedWeeks;
  for (auto &h : config.value("history", Json::array()))
    chosen[isoMonday(day(h["week"]))] = h["profileId"];
  auto waived = [&](const Json &f, const std::vector<int> &window) {
    for (auto &m : config.value("manual", Json::array()))
      if (std::find(window.begin(), window.end(), isoMonday(day(m["week"]))) !=
              window.end() &&
          std::find(m["waiveFrequencyIds"].begin(),
                    m["waiveFrequencyIds"].end(),
                    f["id"]) != m["waiveFrequencyIds"].end())
        return true;
    return false;
  };
  for (auto &f : config.value("frequencies", Json::array()))
    for (auto &[w, p] : chosen) {
      if (f.contains("minGapWeeks") && p == f["profileId"].get<std::string>())
        for (auto &[previous, q] : chosen)
          if (previous < w && q == p &&
              (w - previous) / 7 < f["minGapWeeks"].get<int>() &&
              w >= s.weeks().front() && !waived(f, {previous, w}))
            fail("VERIFY_WEEK_FREQUENCY",
                 f["id"].get<std::string>() + " minimum gap");
      for (auto mode : {"COUNT", "GAP"}) {
        int n = std::string(mode) == "COUNT" ? f.value("windowWeeks", 0)
                                             : f.value("maxGapWeeks", 0);
        if (!n)
          continue;
        int count = 0;
        bool full = true, current = false;
        std::vector<int> window;
        for (int k = 0; k < n; ++k) {
          int at = w - k * 7;
          if (!chosen.contains(at)) {
            full = false;
            break;
          }
          current |= at >= s.weeks().front();
          window.push_back(at);
          count += chosen.at(at) == f["profileId"].get<std::string>();
        }
        if (!full || !current || waived(f, window))
          continue;
        if (std::string(mode) == "GAP") {
          if (count < 1)
            fail("VERIFY_WEEK_FREQUENCY",
                 f["id"].get<std::string>() + " maximum gap");
        } else if (count < f.value("minCount", 0) ||
                   count > f.value("maxCount", n))
          fail("VERIFY_WEEK_FREQUENCY",
               f["id"].get<std::string>() + " rolling window count");
      }
    }
  auto &assignments = result["assignments"];
  std::map<std::tuple<std::string, int, int>, int> exclusivity;
  for (auto &r : s.duties())
    for (int d : s.days)
      if (s.operational(d) && s.matches(r, d)) {
        std::vector<CoverageCandidate> selected;
        for (auto &c : coverageCandidates(s, r, d, s.profile(d)))
          if (actual(s, assignments, c)) {
            bool claimed = r["mode"] == "PRESENCE";
            if (!claimed)
              for (auto &row : result.value("coverage", Json::array()))
                if (row["requirementId"] == r["id"] && row["date"] == date(d))
                  for (auto &person : row["people"])
                    if (person["employeeId"] == s.employees[c.employee].id &&
                        person["date"] == date(c.date) &&
                        person["shiftId"] == s.shifts[c.shift].id)
                      claimed = true;
            if (!claimed)
              continue;
            selected.push_back(c);
            if (r["mode"] == "RESPONSIBILITY" && r.contains("exclusiveGroup"))
              exclusivity[{r["exclusiveGroup"].get<std::string>(), d,
                           c.employee}]++;
          }
        auto check = [&](int count) {
          int target = r["count"];
          bool yes = r["comparison"] == "EQ"   ? count == target
                     : r["comparison"] == "GE" ? count >= target
                                               : count <= target;
          if (!yes)
            fail("VERIFY_COVERAGE", r["id"].get<std::string>() + " " + date(d) +
                                        " count=" + std::to_string(count));
        };
        if (r["mode"] == "RESPONSIBILITY")
          check(int(selected.size()));
        else {
          auto required = requirementSpans(s, r, d);
          std::set<int64_t> points;
          for (auto &a : required) {
            points.insert(a.first);
            points.insert(a.second);
          }
          for (auto &c : selected)
            for (auto &a : c.intervals) {
              points.insert(a.first);
              points.insert(a.second);
            }
          std::vector<int64_t> ordered(points.begin(), points.end());
          for (size_t k = 1; k < ordered.size(); ++k) {
            bool needed = false;
            for (auto &a : required)
              needed |= ordered[k - 1] >= a.first && ordered[k] <= a.second;
            if (!needed)
              continue;
            int count = 0;
            for (auto &c : selected) {
              bool present = false;
              for (auto &a : c.intervals)
                present |= a.first <= ordered[k - 1] && a.second >= ordered[k];
              count += present;
            }
            check(count);
          }
        }
      }
  for (auto &[key, n] : exclusivity)
    if (n > 1)
      fail("VERIFY_DISTINCT_DUTIES",
           "An employee covers multiple responsibilities in the same exclusive "
           "group");
  std::map<std::string, int> employees, shifts;
  for (size_t e = 0; e < s.employees.size(); ++e)
    employees[s.employees[e].id] = int(e);
  for (size_t t = 0; t < s.shifts.size(); ++t)
    shifts[s.shifts[t].id] = int(t);
  auto combined = knownAssignments(s);
  for (auto &a : assignments)
    combined.push_back(a);
  for (auto &a : assignments) {
    int e = employees.at(a["employeeId"]), d = day(a["date"]),
        t = shifts.at(a["shiftId"]);
    auto resolved = s.intervals(e, d, t);
    if (a.contains("weekProfileId") && a["weekProfileId"] != s.profile(d))
      fail("VERIFY_ASSIGNMENT_PROFILE",
           "Assignment profile differs from its ISO week");
    if ((a.contains("intervals") &&
         (resolved.is_null() || a["intervals"] != resolved["intervals"])) ||
        (a.contains("variantId") &&
         (resolved.is_null() || a["variantId"] != resolved["id"])))
      fail("VERIFY_INTERVALS",
           "Concrete intervals differ from the dated shift variant");
    for (auto &r : s.source["allowedShifts"])
      if (r.value("allowRequiredRest", false) && s.matches(r, d) &&
          s.shifts[t].kind == "OFF" &&
          std::find(r["shiftIds"].begin(), r["shiftIds"].end(),
                    s.shifts[t].id) == r["shiftIds"].end()) {
        auto selected = s.select(r["selector"], d);
        if (std::find(selected.begin(), selected.end(), e) == selected.end())
          continue;
        bool required = false;
        for (auto &previous : combined)
          if (previous["employeeId"] == a["employeeId"] &&
              day(previous["date"]) == d - 1)
            for (auto &rule : s.transitions())
              if (rule["type"] == "SUCCESSION" && rule["offsetDays"] == 1 &&
                  s.matches(rule, d - 1)) {
                auto members = s.select(rule["selector"], d - 1);
                required |= std::find(members.begin(), members.end(), e) !=
                                members.end() &&
                            std::find(rule["fromShiftIds"].begin(),
                                      rule["fromShiftIds"].end(),
                                      previous["shiftId"]) !=
                                rule["fromShiftIds"].end() &&
                            std::find(rule["toShiftIds"].begin(),
                                      rule["toShiftIds"].end(),
                                      a["shiftId"]) != rule["toShiftIds"].end();
              }
        if (!required)
          fail("VERIFY_REQUIRED_REST",
               "Rest exception has no qualifying predecessor");
      }
  }
  int distance = 1;
  for (auto &r : s.transitions())
    distance =
        std::max(distance, r["type"] == "MIN_REST"
                               ? r["minimumMinutes"].get<int>() / 1440 + 2
                               : r["offsetDays"].get<int>());
  std::map<std::pair<int, int>, int> cells;
  for (auto &a : combined)
    cells[{employees.at(a["employeeId"]), day(a["date"])}] =
        shifts.at(a["shiftId"]);
  for (auto &[key, t] : cells)
    for (int delta = 1; delta <= distance; ++delta) {
      int next = key.second + delta;
      if (next < s.days.front() || next > s.days.back() ||
          !cells.contains({key.first, next}))
        continue;
      if (!temporalCompatible(s, key.first, key.second, t, next,
                              cells.at({key.first, next}),
                              s.profile(key.second), s.profile(next)))
        fail("VERIFY_TEMPORAL_RULE", s.employees[key.first].id + " " +
                                         date(key.second) + " → " + date(next));
    }
  auto protectedAssignments = s.source["publishedAssignments"];
  if (s.source.contains("replanning"))
    for (auto &a : s.source["replanning"]["baseline"])
      if (day(a["date"]) < day(s.source["replanning"]["from"]))
        protectedAssignments.push_back(a);
  for (auto &a : protectedAssignments) {
    int d = day(a["date"]);
    if (d < s.days.front() || d > s.days.back())
      continue;
    bool same = false;
    for (auto &b : assignments)
      if (a["employeeId"] == b["employeeId"] && a["date"] == b["date"] &&
          a["shiftId"] == b["shiftId"]) {
        auto concrete = s.intervals(employees.at(a["employeeId"]), d,
                                    shifts.at(a["shiftId"]));
        same = (!a.contains("intervals") ||
                (!concrete.is_null() &&
                 a["intervals"] == concrete["intervals"])) &&
               (!a.contains("weekProfileId") ||
                a["weekProfileId"] == s.profile(d));
      }
    if (!same)
      fail("VERIFY_FROZEN_PREFIX",
           "Protected assignment changed its shift, concrete hours or profile");
  }
  if (s.source.contains("replanning"))
    for (auto &a : assignments)
      if (day(a["date"]) < day(s.source["replanning"]["from"])) {
        bool existed = false;
        for (auto &b : s.source["replanning"]["baseline"])
          if (a["employeeId"] == b["employeeId"] && a["date"] == b["date"])
            existed = true;
        if (!existed)
          fail("VERIFY_FROZEN_PREFIX",
               "Regeneration added an assignment before its effective date");
      }
  Json choices = Json::array();
  for (auto &row : result.value("coverage", Json::array()))
    for (auto &person : row["people"])
      choices.push_back({{"requirementId", row["requirementId"]},
                         {"date", row["date"]},
                         {"employeeId", person["employeeId"]},
                         {"sourceDate", person["date"]},
                         {"shiftId", person["shiftId"]}});
  for (auto &a : assignments) {
    bool binding = false, claimed = false;
    for (auto &r : s.duties())
      if (r["mode"] == "RESPONSIBILITY" && r.value("bindAssignments", true) &&
          (s.source.value("dutyBindingMode", "ACTIVE_SCOPE") == "GLOBAL" ||
           s.matches(r, day(a["date"]))) &&
          std::find(r["shiftIds"].begin(), r["shiftIds"].end(), a["shiftId"]) !=
              r["shiftIds"].end())
        binding = true;
    for (auto &choice : choices)
      if (choice["employeeId"] == a["employeeId"] &&
          choice["sourceDate"] == a["date"] &&
          choice["shiftId"] == a["shiftId"])
        claimed = true;
    if (binding && !claimed)
      fail("VERIFY_DUTY_BINDING",
           "A duty-bound shift has no qualified responsibility assignment");
  }
  if (result.contains("coverage") &&
      result["coverage"] != scheduleCoverage(s, assignments, choices))
    fail("VERIFY_COVERAGE_REPORT",
         "Coverage report differs from independent assignment replay");
  return out;
}
Json regenerate(const Json &scenario, const Json &request) {
  validate(scenario);
  if (!request.is_object() || !request.contains("from") ||
      !request.contains("previousScenario") ||
      !request.contains("previousResult"))
    throw Error(
        "REGENERATION_REQUEST", "/",
        "Regeneration requires from, previousScenario and previousResult");
  for (auto it = request.begin(); it != request.end(); ++it)
    if (it.key() != "from" && it.key() != "previousScenario" &&
        it.key() != "previousResult" && it.key() != "stabilityPriority" &&
        it.key() != "previousScenarioEncoding")
      throw Error("SCHEMA", "/", "Unknown regeneration property: " + it.key());
  auto previous = request["previousResult"];
  auto previousScenario = request["previousScenario"];
  if (request.contains("previousScenarioEncoding")) {
    auto original =
        Json::parse(request["previousScenarioEncoding"].get<std::string>());
    if (integrityHash(original) != integrityHash(previousScenario))
      throw Error(
          "CONFIGURATION_MISMATCH", "/previousScenarioEncoding",
          "Original encoded scenario differs from its readable context");
    previousScenario = original;
  }
  auto checked = verify(previousScenario, previous);
  if (checked["status"] != "VERIFIED")
    return checked;
  if (previous.value("metadata", Json::object())
          .value("configurationHash", "") !=
      configurationHash(previousScenario))
    throw Error("CONFIGURATION_MISMATCH", "/previousResult",
                "Previous result does not match its supplied scenario");
  int from = day(request["from"]);
  if (from < day(scenario["calendar"]["start"]) ||
      from > day(scenario["calendar"]["end"]))
    throw Error("REGENERATION_RANGE", "/from",
                "Regeneration date must be inside the current horizon");
  Json updated = scenario;
  updated["schemaVersion"] = std::max(2, scenario["schemaVersion"].get<int>());
  updated["replanning"] = {
      {"from", request["from"]},
      {"baseline", previous["assignments"]},
      {"stabilityPriority",
       request.value("stabilityPriority", "BEFORE_FAIRNESS")}};
  auto result = solve(updated);
  result["scenario"] = updated;
  if (result.contains("assignments")) {
    std::map<std::pair<std::string, std::string>, Json> before, after;
    for (auto &a : previous["assignments"])
      before[{a["employeeId"], a["date"]}] = a;
    for (auto &a : result["assignments"])
      after[{a["employeeId"], a["date"]}] = a;
    std::set<std::pair<std::string, std::string>> cells;
    for (auto &[key, value] : before) {
      (void)value;
      cells.insert(key);
    }
    for (auto &[key, value] : after) {
      (void)value;
      cells.insert(key);
    }
    result["changes"] = Json::array();
    for (auto &key : cells)
      if (before[key] != after[key])
        result["changes"].push_back(
            {{"employeeId", key.first},
             {"date", key.second},
             {"beforeShiftId",
              before[key].is_object() ? before[key]["shiftId"] : Json(nullptr)},
             {"afterShiftId",
              after[key].is_object() ? after[key]["shiftId"] : Json(nullptr)},
             {"beforeIntervals",
              before[key].is_object()
                  ? before[key].value("intervals", Json::array())
                  : Json::array()},
             {"afterIntervals",
              after[key].is_object()
                  ? after[key].value("intervals", Json::array())
                  : Json::array()}});
  }
  return result;
}
} // namespace rostercore
