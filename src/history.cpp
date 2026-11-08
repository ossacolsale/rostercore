#include "rostercore/core.hpp"
#include <algorithm>
namespace rostercore {
std::string objectiveFingerprint(const Json &o) {
  Json definition;
  for (auto key : {"id", "type", "mode", "measure", "selector", "shiftIds",
                   "participation", "weights", "scope", "_policyScope"})
    if (o.contains(key))
      definition[key] = o[key];
  return sha256(definition.dump());
}
bool targetShift(const Scenario &s, const Json &o, int shift) {
  auto &ids = o["shiftIds"];
  return std::find(ids.begin(), ids.end(), s.shifts.at(shift).id) != ids.end();
}
std::map<int, int64_t> participants(const Scenario &s, const Json &o, int d) {
  std::map<int, int64_t> weights;
  if (s.excluded(d) || !applies(o, d))
    return weights;
  for (int e : s.select(o["selector"])) {
    bool eligible = true;
    if (o["participation"] == "AVAILABILITY_WEIGHTED") {
      eligible = false;
      for (int sh : s.allowed(e, d))
        if (targetShift(s, o, sh))
          eligible = true;
    }
    if (eligible)
      weights[e] = o["participation"] == "CUSTOM_WEIGHTED"
                       ? o["weights"][s.employees[e].id].get<int64_t>()
                       : 1;
  }
  return weights;
}
Ledger historicalLedger(const Scenario &s, const Json &o) {
  Ledger out;
  auto selected = s.select(o["selector"]);
  std::set<int> members(selected.begin(), selected.end());
  for (int e : selected) {
    out.ideal[e] = {};
    out.actual[e] = 0;
  }
  std::map<std::string, int> employeeIndex, shiftIndex;
  for (size_t e = 0; e < s.employees.size(); ++e)
    employeeIndex[s.employees[e].id] = int(e);
  for (size_t t = 0; t < s.shifts.size(); ++t)
    shiftIndex[s.shifts[t].id] = int(t);
  std::map<int, Json> snapshots;
  for (auto &snap : s.source["history"]["fairnessSnapshots"])
    if (snap["objectiveId"] == o["id"]) {
      if (snap["fingerprint"] != objectiveFingerprint(o))
        throw Error(
            "HISTORY_REBUILD_REQUIRED", "/history/fairnessSnapshots",
            "Objective definition changed; rebuild dated participation "
            "snapshots from original historical context before solving");
      snapshots[day(snap["date"])] = snap;
    }
  std::map<int, std::vector<int>> actual;
  for (auto &a : s.source["history"]["assignments"]) {
    int e = employeeIndex.at(a["employeeId"]), t = shiftIndex.at(a["shiftId"]),
        d = day(a["date"]);
    if (members.contains(e) && targetShift(s, o, t) && applies(o, d))
      actual[d].push_back(e);
  }
  for (auto &[d, es] : actual) {
    if (!snapshots.contains(d))
      throw Error("HISTORY_SNAPSHOT_REQUIRED", "/history/fairnessSnapshots",
                  "Missing dated participation snapshot for " + date(d));
    auto &w = snapshots.at(d)["weights"];
    int64_t total = 0;
    for (auto it = w.begin(); it != w.end(); ++it) {
      int e = employeeIndex.at(it.key());
      if (!members.contains(e))
        throw Error("HISTORY_PARTICIPANTS", "/history",
                    "Snapshot participant outside objective selector");
      total = checked(total, it.value().get<int64_t>());
    }
    if (total == 0)
      throw Error("NO_PARTICIPANTS", "/history",
                  "Historical duties have no quota participants");
    for (auto it = w.begin(); it != w.end(); ++it) {
      int e = employeeIndex.at(it.key());
      out.ideal[e] =
          out.ideal[e] +
          Rational(checked(int64_t(es.size()), it.value().get<int64_t>(), true),
                   total);
    }
    for (int e : es)
      out.actual[e]++;
  }
  return out;
}
static Rational absolute(Rational r) { return {std::abs(r.n), r.d}; }
static bool greater(Rational a, Rational b) {
  return checked(a.n, b.d, true) > checked(b.n, a.d, true);
}
FairnessData fairness(const Scenario &s, const Json &assignments) {
  FairnessData data{Json::array(), Json::array()};
  std::map<std::string, int> employees, shifts;
  for (size_t e = 0; e < s.employees.size(); ++e)
    employees[s.employees[e].id] = int(e);
  for (size_t t = 0; t < s.shifts.size(); ++t)
    shifts[s.shifts[t].id] = int(t);
  for (auto &p : s.activePolicies) {
    auto &o = p["objective"];
    auto ledger = historicalLedger(s, o);
    auto initial = ledger;
    auto selected = s.select(o["selector"]);
    std::set<int> members(selected.begin(), selected.end());
    Json prefixes = Json::array();
    Rational maxDeviation, sumDeviation, finalDeviation;
    for (int d : s.days) {
      if (s.excluded(d) || !applies(o, d))
        continue;
      auto weights = participants(s, o, d);
      Json w = Json::object();
      int64_t denominator = 0;
      for (auto &[e, v] : weights) {
        w[s.employees[e].id] = v;
        denominator = checked(denominator, v);
      }
      data.snapshots.push_back({{"date", date(d)},
                                {"objectiveId", o["id"]},
                                {"fingerprint", objectiveFingerprint(o)},
                                {"weights", w}});
      std::vector<int> actual;
      for (auto &a : assignments)
        if (day(a["date"]) == d) {
          int e = employees.at(a["employeeId"]);
          if (members.contains(e) && targetShift(s, o, shifts.at(a["shiftId"])))
            actual.push_back(e);
        }
      if (!actual.empty() && denominator == 0)
        throw Error("NO_PARTICIPANTS", "/objective",
                    "Produced assignments have no eligible participants");
      for (auto &[e, v] : weights)
        ledger.ideal[e] =
            ledger.ideal[e] +
            Rational(checked(int64_t(actual.size()), v, true), denominator);
      for (int e : actual)
        ledger.actual[e]++;
      Json rows = Json::array();
      finalDeviation = {};
      for (int e : selected) {
        auto debt = ledger.ideal[e] - Rational(ledger.actual[e]);
        auto abs = absolute(debt);
        if (greater(abs, maxDeviation))
          maxDeviation = abs;
        sumDeviation = sumDeviation + abs;
        finalDeviation = finalDeviation + abs;
        rows.push_back({{"employeeId", s.employees[e].id},
                        {"ideal", ledger.ideal[e].json()},
                        {"actual", ledger.actual[e]},
                        {"debt", debt.json()}});
      }
      prefixes.push_back({{"date", date(d)}, {"employees", rows}});
    }
    Json rows = Json::array();
    if (prefixes.empty())
      for (int e : selected)
        finalDeviation = finalDeviation +
                         absolute(ledger.ideal[e] - Rational(ledger.actual[e]));
    for (int e : selected)
      rows.push_back(
          {{"employeeId", s.employees[e].id},
           {"initialIdeal", initial.ideal[e].json()},
           {"initialActual", initial.actual[e]},
           {"initialDebt",
            (initial.ideal[e] - Rational(initial.actual[e])).json()},
           {"ideal", ledger.ideal[e].json()},
           {"actual", ledger.actual[e]},
           {"debt", (ledger.ideal[e] - Rational(ledger.actual[e])).json()}});
    data.report.push_back(
        {{"policyId", p["id"]},
         {"objectiveId", o["id"]},
         {"employees", rows},
         {"prefixes", prefixes},
         {"metrics",
          {{"MAX_ABSOLUTE_PREFIX_DEVIATION", maxDeviation.json()},
           {"SUM_ABSOLUTE_PREFIX_DEVIATIONS", sumDeviation.json()},
           {"FINAL_ABSOLUTE_DEVIATION", finalDeviation.json()}}}});
  }
  return data;
}
Json consolidate(const Json &scenario, const Json &result,
                 const std::string &through) {
  validate(scenario);
  Scenario s(scenario);
  int stop = day(through);
  if (stop < s.days.front() || stop > s.days.back())
    throw Error("CONSOLIDATION_RANGE", "/through",
                "Consolidation date must be inside the horizon");
  auto verified = verify(scenario, result);
  if (verified["status"] != "VERIFIED")
    return verified;
  if (!result.contains("metadata") ||
      result["metadata"].value("configurationHash", "") !=
          sha256(scenario.dump()))
    throw Error("CONFIGURATION_MISMATCH", "/result",
                "Result does not belong to this exact configuration");
  Json updated = scenario;
  auto f = fairness(s, result["assignments"]);
  for (auto &a : result["assignments"])
    if (day(a["date"]) <= stop)
      updated["history"]["assignments"].push_back(a);
  for (auto &a : f.snapshots)
    if (day(a["date"]) <= stop)
      updated["history"]["fairnessSnapshots"].push_back(a);
  updated["history"]["through"] = through;
  updated["calendar"]["start"] = date(stop + 1);
  if (stop == s.days.back())
    updated["calendar"]["end"] = date(stop + 1);
  Json published = Json::array();
  for (auto &a : updated["publishedAssignments"])
    if (day(a["date"]) > stop)
      published.push_back(a);
  updated["publishedAssignments"] = published;
  updated["revision"] = updated["revision"].get<int>() + 1;
  validate(updated);
  auto out = response("CONSOLIDATED");
  out["scenario"] = updated;
  return out;
}
Json rebuildHistory(const Json &scenario, const Json &document, bool dryRun) {
  validate(scenario);
  validateSchema(document, "history-contexts");
  Scenario current(scenario);
  Json updated = scenario;
  std::set<std::string> active;
  for (auto &p : current.activePolicies)
    active.insert(p["objective"]["id"]);
  Json rebuilt = Json::array();
  for (auto &snap : scenario["history"]["fairnessSnapshots"])
    if (!active.contains(snap["objectiveId"].get<std::string>()))
      rebuilt.push_back(snap);
  std::set<int> covered;
  for (auto context : document["scenarios"]) {
    validate(context);
    Scenario dated(context);
    if (dated.days.back() >= current.days.front())
      throw Error("HISTORY_CONTEXT_RANGE", "/scenarios",
                  "Historical contexts must precede the current horizon");
    for (int d : dated.days)
      if (!covered.insert(d).second)
        throw Error("HISTORY_CONTEXT_OVERLAP", "/scenarios",
                    "Historical contexts must not overlap");
    context["policies"] = scenario["policies"];
    context["constraints"] = scenario["constraints"];
    context["baseConstraintIds"] = scenario["baseConstraintIds"];
    context["constraintSets"] = scenario["constraintSets"];
    context["history"] = {{"assignments", Json::array()},
                          {"fairnessSnapshots", Json::array()}};
    validate(context);
    Scenario historical(context);
    Json actual = Json::array();
    for (auto &a : scenario["history"]["assignments"])
      if (day(a["date"]) >= dated.days.front() &&
          day(a["date"]) <= dated.days.back()) {
        if (historical.excluded(day(a["date"])))
          throw Error("HISTORY_CONTEXT_CONFLICT", "/scenarios",
                      "Historical assignments occur on a date excluded by the "
                      "supplied context");
        actual.push_back(a);
      }
    auto recomputed = fairness(historical, actual);
    for (auto &snap : recomputed.snapshots)
      rebuilt.push_back(snap);
  }
  for (auto &a : scenario["history"]["assignments"])
    if (!covered.contains(day(a["date"])))
      throw Error(
          "HISTORY_CONTEXT_MISSING", "/scenarios",
          "Dated context does not cover all historical assignment dates");
  updated["history"]["fairnessSnapshots"] = rebuilt;
  updated["revision"] = updated["revision"].get<int>() + 1;
  validate(updated);
  Scenario ready(updated);
  for (auto &p : ready.activePolicies)
    historicalLedger(ready, p["objective"]);
  auto out = response(dryRun ? "PREVIEW" : "IMPORTED");
  out["preview"] = {{"historicalAssignmentsPreserved", true},
                    {"snapshotCount", rebuilt.size()},
                    {"activeObjectivesRecomputed", active.size()}};
  if (!dryRun)
    out["scenario"] = updated;
  return out;
}

} // namespace rostercore
