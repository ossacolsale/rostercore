#include "rostercore/core.hpp"
#include <algorithm>
#include <limits>
namespace rostercore {
Json knownAssignments(const Scenario &s) {
  std::map<std::pair<std::string, std::string>, Json> cells;
  for (auto &a : s.source["publishedAssignments"])
    if (day(a["date"]) < s.days.front())
      cells[{a["employeeId"], a["date"]}] = a;
  for (auto &a : s.source["history"]["assignments"])
    cells[{a["employeeId"], a["date"]}] = a;
  Json out = Json::array();
  for (auto &[key, a] : cells) {
    (void)key;
    out.push_back(a);
  }
  return out;
}
std::vector<SpacingPair> spacingPairs(const Scenario &s, const Json &r) {
  std::vector<SpacingPair> pairs;
  int gap = r["minimumGap"];
  auto known = knownAssignments(s);
  for (size_t e = 0; e < s.employees.size(); ++e) {
    std::set<int> candidates;
    for (auto &a : known)
      if (a["employeeId"] == s.employees[e].id)
        for (size_t t = 0; t < s.shifts.size(); ++t)
          if (a["shiftId"] == s.shifts[t].id && targetShift(s, r, int(t)))
            candidates.insert(day(a["date"]));
    for (int d : s.days) {
      for (int t : s.allowed(int(e), d))
        if (targetShift(s, r, t)) {
          candidates.insert(d);
          break;
        }
    }
    for (int second : s.days)
      if (candidates.contains(second))
        for (auto &pj :
             s.weekOptions(second).value("profileIds", Json::array())) {
          std::string p = pj;
          if (!s.matches(r, second, p))
            continue;
          auto members = s.select(r["selector"], second, {}, p);
          if (std::find(members.begin(), members.end(), int(e)) ==
              members.end())
            continue;
          for (int first : candidates) {
            if (first >= second)
              break;
            if (r["unit"] == "CALENDAR" && second - first >= gap)
              continue;
            if (r["unit"] == "NORMAL_WORK_DAYS") {
              int fixed = 0;
              for (auto &a : known)
                if (a["employeeId"] == s.employees[e].id &&
                    day(a["date"]) > first && day(a["date"]) < second &&
                    std::find(r["normalShiftIds"].begin(),
                              r["normalShiftIds"].end(),
                              a["shiftId"]) != r["normalShiftIds"].end())
                  ++fixed;
              if (fixed >= gap)
                continue;
            }
            if (pairs.size() >= 2000000)
              throw Error("SIZE_LIMIT", "/spacingRules",
                          "Spacing exceeds two million candidate pairs; narrow "
                          "scope or horizon");
            pairs.push_back({int(e), first, second, p});
          }
        }
  }
  return pairs;
}
Json workloadReport(const Scenario &s, const Json &assignments) {
  auto combined = knownAssignments(s);
  for (auto &a : assignments)
    combined.push_back(a);
  std::map<std::pair<std::string, int>, std::string> cells;
  for (auto &a : combined)
    cells[{a["employeeId"], day(a["date"])}] = a["shiftId"];
  Json report = Json::array();
  for (auto &r : s.source.value("spacingRules", Json::array())) {
    auto pairs = spacingPairs(s, r);
    for (size_t e = 0; e < s.employees.size(); ++e) {
      std::vector<int> dates;
      Json types = Json::object();
      int current = 0, historical = 0;
      for (auto &[key, shift] : cells)
        if (key.first == s.employees[e].id)
          for (size_t t = 0; t < s.shifts.size(); ++t)
            if (s.shifts[t].id == shift && targetShift(s, r, int(t))) {
              dates.push_back(key.second);
              if (key.second >= s.days.front() && key.second <= s.days.back()) {
                ++current;
                types[shift] = types.value(shift, 0) + 1;
              } else
                ++historical;
            }
      int minCal = std::numeric_limits<int>::max(), minNormal = minCal,
          consecutive = 0, close = 0, cost = 0;
      for (size_t i = 1; i < dates.size(); ++i)
        if (dates[i] >= s.days.front() && dates[i] <= s.days.back()) {
          int normal = 0;
          for (int d = dates[i - 1] + 1; d < dates[i]; ++d)
            if (cells.contains({s.employees[e].id, d}) &&
                std::find(r["normalShiftIds"].begin(),
                          r["normalShiftIds"].end(),
                          cells.at({s.employees[e].id, d})) !=
                    r["normalShiftIds"].end())
              ++normal;
          minCal = std::min(minCal, dates[i] - dates[i - 1]);
          minNormal = std::min(minNormal, normal);
          consecutive += dates[i] - dates[i - 1] == 1;
        }
      for (auto &pair : pairs)
        if (pair.employee == int(e) && pair.profile == s.profile(pair.second) &&
            cells.contains({s.employees[e].id, pair.first}) &&
            cells.contains({s.employees[e].id, pair.second})) {
          auto burden = [&](int d) {
            for (size_t t = 0; t < s.shifts.size(); ++t)
              if (cells.at({s.employees[e].id, d}) == s.shifts[t].id)
                return targetShift(s, r, int(t));
            return false;
          };
          if (!burden(pair.first) || !burden(pair.second))
            continue;
          int distance = pair.second - pair.first;
          if (r["unit"] == "NORMAL_WORK_DAYS") {
            distance = 0;
            for (int d = pair.first + 1; d < pair.second; ++d)
              if (cells.contains({s.employees[e].id, d}) &&
                  std::find(r["normalShiftIds"].begin(),
                            r["normalShiftIds"].end(),
                            cells.at({s.employees[e].id, d})) !=
                      r["normalShiftIds"].end())
                ++distance;
          }
          int deficit = std::max(0, r["minimumGap"].get<int>() - distance);
          if (deficit) {
            ++close;
            cost += r["penalty"] == "CLOSE_PAIRS" ? 1 : deficit;
          }
        }
      report.push_back(
          {{"ruleId", r["id"]},
           {"employeeId", s.employees[e].id},
           {"mode", r["mode"]},
           {"unit", r["unit"]},
           {"totalBurden", current},
           {"byShift", types},
           {"knownPriorBurden", historical},
           {"minimumCalendarGap", minCal == std::numeric_limits<int>::max()
                                      ? Json(nullptr)
                                      : Json(minCal)},
           {"minimumNormalWorkGap", minNormal == std::numeric_limits<int>::max()
                                        ? Json(nullptr)
                                        : Json(minNormal)},
           {"consecutivePairs", consecutive},
           {"closePairs", close},
           {"penalty", cost}});
    }
  }
  return report;
}
} // namespace rostercore
