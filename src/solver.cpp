#include "rostercore/core.hpp"
#include <algorithm>
#include <chrono>
#include <functional>
#include <ortools/base/version.h>
#include <ortools/sat/cp_model.h>
#include <ortools/sat/cp_model_solver.h>
#include <tuple>
namespace rostercore {
namespace {
using namespace operations_research;
using namespace operations_research::sat;
struct Compiler {
  const Scenario &s;
  CpModelBuilder model;
  std::map<std::tuple<int, int, int>, BoolVar> x;
  std::map<std::string, int> shifts, employees;
  std::map<int, Json> assumptionLabels;
  struct Stage {
    std::string policyId, metric;
    LinearExpr value;
    int64_t scale;
  };

#include "compiler_extensions.inc"
  explicit Compiler(const Scenario &scenario) : s(scenario) {
    for (size_t t = 0; t < s.shifts.size(); ++t)
      shifts[s.shifts[t].id] = int(t);
    for (size_t e = 0; e < s.employees.size(); ++e)
      employees[s.employees[e].id] = int(e);
  }
  LinearExpr count(const Json &selector, const std::set<int> &ts, int d,
                   const std::string &profileId = "") {
    LinearExpr sum;
    for (int e : s.select(selector, d, {}, profileId))
      for (int t : ts) {
        auto it = x.find({e, d, t});
        if (it != x.end())
          sum += it->second;
      }
    return sum;
  }
  BoolVar atom(const LinearExpr &sum, const std::string &comparison,
               int64_t n) {
    auto b = model.NewBoolVar();
    if (comparison == "EQ") {
      model.AddEquality(sum, n).OnlyEnforceIf(b);
      model.AddNotEqual(sum, n).OnlyEnforceIf(b.Not());
    } else if (comparison == "GE") {
      model.AddGreaterOrEqual(sum, n).OnlyEnforceIf(b);
      model.AddLessThan(sum, n).OnlyEnforceIf(b.Not());
    } else {
      model.AddLessOrEqual(sum, n).OnlyEnforceIf(b);
      model.AddGreaterThan(sum, n).OnlyEnforceIf(b.Not());
    }
    return b;
  }
  BoolVar expression(const Json &exp, int d, const std::set<int> &branch = {},
                     const std::string &profileId = "") {
    std::string op = exp["op"];
    if (op == "COUNT")
      return atom(
          count(exp["selector"], {shifts.at(exp["shiftId"])}, d, profileId),
          exp["comparison"], exp["count"]);
    if (op == "REMAINING") {
      std::set<int> forbidden;
      for (size_t t = 0; t < s.shifts.size(); ++t)
        if (!branch.contains(int(t)) && int(t) != shifts.at(exp["shiftId"]))
          forbidden.insert(int(t));
      return atom(count(exp["selector"], forbidden, d, profileId), "EQ", 0);
    }
    std::set<int> local;
    for (auto &c : exp["children"])
      if (c["op"] == "COUNT")
        local.insert(shifts.at(c["shiftId"]));
    std::vector<BoolVar> children, negated;
    for (auto &c : exp["children"]) {
      auto v = expression(c, d, local, profileId);
      children.push_back(v);
      negated.push_back(v.Not());
    }
    auto b = model.NewBoolVar();
    if (op == "AND") {
      model.AddBoolAnd(children).OnlyEnforceIf(b);
      model.AddBoolOr(negated).OnlyEnforceIf(b.Not());
    } else {
      model.AddBoolOr(children).OnlyEnforceIf(b);
      model.AddBoolAnd(negated).OnlyEnforceIf(b.Not());
    }
    return b;
  }
  void assignments() {
    calendar();
    for (int d : s.days)
      for (size_t e = 0; e < s.employees.size(); ++e) {
        if (!s.plannable(int(e), d))
          continue;
        std::vector<BoolVar> vars;
        for (int t : s.allowed(int(e), d)) {
          auto v = model.NewBoolVar();
          x[{int(e), d, t}] = v;
          vars.push_back(v);
        }
        model.AddExactlyOne(vars);
        for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
          std::string p = pj;
          auto allowed = s.domain(int(e), d, p);
          for (int t : s.allowed(int(e), d))
            if (std::find(allowed.begin(), allowed.end(), t) == allowed.end())
              model.AddEquality(x.at({int(e), d, t}), 0)
                  .OnlyEnforceIf(week(d, p));
        }
      }
    for (auto &c : s.constraints())
      for (int d : s.days)
        if (s.operational(d))
          for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
            std::string p = pj;
            if (!s.matches(c, d, p))
              continue;
            auto root = expression(c["expression"], d, {}, p),
                 assumption = model.NewBoolVar();
            model.AddBoolOr({week(d, p).Not(), root}).OnlyEnforceIf(assumption);
            model.AddAssumption(assumption);
            assumptionLabels[assumption.index()] = {
                {"constraintId", c["id"]}, {"date", date(d)}, {"profileId", p}};
          }
    auto locks = s.source["publishedAssignments"];
    if (s.source.contains("replanning"))
      for (auto &a : s.source["replanning"]["baseline"])
        if (day(a["date"]) < day(s.source["replanning"]["from"]))
          locks.push_back(a);
    for (auto &a : locks) {
      int d = day(a["date"]);
      if (d < s.days.front() || d > s.days.back())
        continue;
      int e = employees.at(a["employeeId"]), t = shifts.at(a["shiftId"]);
      auto it = x.find({e, d, t});
      if (it == x.end())
        model.AddBoolOr({});
      else {
        model.AddEquality(it->second, 1);
        if (a.contains("weekProfileId"))
          model.AddEquality(week(d, a["weekProfileId"]), 1);
        if (a.contains("intervals"))
          for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
            std::string p = pj;
            auto concrete = s.intervals(e, d, t, p);
            if (concrete.is_null() || concrete["intervals"] != a["intervals"])
              model.AddEquality(week(d, p), 0);
          }
      }
    }
    if (s.source.contains("replanning"))
      for (auto &[key, v] : x) {
        auto [e, d, t] = key;
        if (d >= day(s.source["replanning"]["from"]))
          continue;
        bool existed = false;
        for (auto &a : s.source["replanning"]["baseline"])
          if (a["employeeId"] == s.employees[e].id && day(a["date"]) == d &&
              a["shiftId"] == s.shifts[t].id)
            existed = true;
        if (!existed)
          model.AddEquality(v, 0);
      }
    advanced();
  }
  std::vector<Stage> objectives() {
    auto stages = preferredStages();
    bool stable = s.source.contains("replanning");
    if (stable &&
        s.source["replanning"]["stabilityPriority"] == "BEFORE_FAIRNESS")
      stages.push_back(stability());
    for (auto &p : s.activePolicies) {
      auto &o = p["objective"];
      auto selected = fairnessMembers(s, o);
      auto ledger = historicalLedger(s, o);
      if (selected.empty())
        continue;
      int64_t scale = 1;
      for (int e : selected)
        scale = lcm(scale, ledger.ideal[e].d);
      std::map<std::pair<int, std::string>, std::map<int, int64_t>> weights;
      std::map<std::pair<int, std::string>, int64_t> denominators;
      int dates = 0;
      bool uniform = o["participation"] == "EQUAL";
      for (int d : s.days)
        if (s.operational(d)) {
          bool any = false;
          for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
            std::string pid = pj;
            if (!s.matches(o, d, pid))
              continue;
            any = true;
            auto key = std::make_pair(d, pid);
            weights[key] = participants(s, o, d, pid);
            int64_t total = 0;
            for (auto &[e, w] : weights[key]) {
              (void)e;
              total = checked(total, w);
            }
            denominators[key] = total;
            if (total)
              scale = lcm(scale, total);
            uniform &= weights[key].size() == selected.size();
            for (auto &[e, w] : weights[key]) {
              (void)e;
              uniform &= w == 1;
            }
          }
          dates += any;
        }
      int64_t bound = checked(
          int64_t(s.days.size()) * int64_t(selected.size()) + 1, scale, true);
      for (int e : selected)
        bound = checked(bound, checked(std::abs(ledger.ideal[e].n),
                                       scale / ledger.ideal[e].d, true) +
                                   checked(ledger.actual[e], scale, true));
      checked(bound,
              std::max<int64_t>(1, int64_t(dates) * int64_t(selected.size())),
              true);
      std::map<int, LinearExpr> debt;
      int64_t historicalTotal = 0;
      for (int e : selected) {
        debt[e] = checked(ledger.ideal[e].n, scale / ledger.ideal[e].d, true) -
                  checked(ledger.actual[e], scale, true);
        historicalTotal = checked(historicalTotal, ledger.actual[e]);
      }
      for (int e : selected) {
        auto expected = Rational(historicalTotal, int64_t(selected.size()));
        uniform &=
            ledger.ideal[e].n == expected.n && ledger.ideal[e].d == expected.d;
      }
      std::set<int> targets;
      for (size_t t = 0; t < s.shifts.size(); ++t)
        if (targetShift(s, o, int(t)))
          targets.insert(int(t));
      std::vector<IntVar> prefixAbs;
      LinearExpr cumulativeProduced(historicalTotal);
      for (int d : s.days) {
        if (!s.operational(d))
          continue;
        std::vector<BoolVar> active;
        for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
          std::string pid = pj;
          if (!s.matches(o, d, pid))
            continue;
          auto gate = week(d, pid);
          active.push_back(gate);
          auto key = std::make_pair(d, pid);
          int64_t denominator = denominators[key];
          auto produced = model.NewIntVar(Domain(0, int64_t(selected.size())));
          model.AddEquality(produced, count(o["selector"], targets, d, pid))
              .OnlyEnforceIf(gate);
          model.AddEquality(produced, 0).OnlyEnforceIf(gate.Not());
          if (!denominator)
            model.AddEquality(produced, 0);
          cumulativeProduced += produced;
          auto daily = s.select(o["selector"], d, {}, pid);
          for (int e : selected) {
            if (weights[key].contains(e))
              debt[e] += LinearExpr(produced) *
                         checked(scale / denominator, weights[key][e], true);
            if (std::find(daily.begin(), daily.end(), e) != daily.end()) {
              auto actual = model.NewIntVar(Domain(0, 1));
              model
                  .AddEquality(actual,
                               count(Json{{"employeeIds",
                                           Json::array({s.employees[e].id})}},
                                     targets, d, pid))
                  .OnlyEnforceIf(gate);
              model.AddEquality(actual, 0).OnlyEnforceIf(gate.Not());
              debt[e] -= LinearExpr(actual) * scale;
            }
          }
        }
        if (active.empty())
          continue;
        std::vector<BoolVar> inactive;
        for (auto a : active)
          inactive.push_back(a.Not());
        auto included = conjunction(inactive).Not();
        LinearExpr total;
        for (int e : selected) {
          auto raw = model.NewIntVar(Domain(0, bound)),
               abs = model.NewIntVar(Domain(0, bound));
          model.AddAbsEquality(raw, debt[e]);
          model.AddEquality(abs, raw).OnlyEnforceIf(included);
          model.AddEquality(abs, 0).OnlyEnforceIf(included.Not());
          prefixAbs.push_back(abs);
          total += abs;
        }
        if (uniform) {
          int64_t n = int64_t(selected.size());
          auto remainder = model.NewIntVar(Domain(0, n - 1)),
               lower = model.NewIntVar(Domain(0, bound));
          model.AddModuloEquality(remainder, cumulativeProduced, n);
          auto table = model.AddAllowedAssignments({remainder, lower});
          for (int64_t r = 0; r < n; ++r)
            table.AddTuple({r, checked(2 * r * (n - r), scale / n, true)});
          model.AddGreaterOrEqual(total, lower).OnlyEnforceIf(included);
        }
      }
      auto maximum = model.NewIntVar(Domain(0, bound));
      if (prefixAbs.empty())
        model.AddEquality(maximum, 0);
      else
        model.AddMaxEquality(maximum, prefixAbs);
      LinearExpr sum, final;
      for (auto a : prefixAbs)
        sum += a;
      for (int e : selected) {
        auto a = model.NewIntVar(Domain(0, bound));
        model.AddAbsEquality(a, debt[e]);
        final += a;
      }
      for (auto &m : o["metrics"]) {
        std::string metric = m;
        stages.push_back({p["id"], metric,
                          metric == "MAX_ABSOLUTE_PREFIX_DEVIATION"
                              ? LinearExpr(maximum)
                          : metric == "SUM_ABSOLUTE_PREFIX_DEVIATIONS" ? sum
                                                                       : final,
                          scale});
      }
    }
    if (stable &&
        s.source["replanning"]["stabilityPriority"] == "AFTER_FAIRNESS")
      stages.push_back(stability());
    return stages;
  }
};
} // namespace
bool evaluate(const Scenario &s, const Json &exp, int d,
              const std::map<std::pair<int, int>, int> &assignments) {
  std::string op = exp["op"];
  if (op == "COUNT") {
    int n = 0;
    for (int e : s.select(exp["selector"], d)) {
      auto it = assignments.find({e, d});
      if (it != assignments.end() &&
          s.shifts[it->second].id == exp["shiftId"].get<std::string>())
        ++n;
    }
    int target = exp["count"];
    return exp["comparison"] == "EQ"
               ? n == target
               : (exp["comparison"] == "GE" ? n >= target : n <= target);
  }
  if (op == "AND" || op == "OR") {
    std::set<std::string> explicitShifts;
    for (auto &c : exp["children"])
      if (c["op"] == "COUNT")
        explicitShifts.insert(c["shiftId"]);
    bool answer = op == "AND";
    for (auto &c : exp["children"]) {
      bool value;
      if (c["op"] == "REMAINING") {
        value = true;
        for (int e : s.select(c["selector"], d)) {
          auto it = assignments.find({e, d});
          if (it != assignments.end()) {
            auto id = s.shifts[it->second].id;
            if (id != c["shiftId"].get<std::string>() &&
                !explicitShifts.contains(id))
              value = false;
          }
        }
      } else
        value = evaluate(s, c, d, assignments);
      if (op == "AND")
        answer &= value;
      else
        answer |= value;
    }
    return answer;
  }
  throw Error("AMBIGUOUS_REMAINING", "/constraints",
              "REMAINING outside a branch");
}
Json verify(const Json &scenario, const Json &result) {
  validate(scenario);
  validateSchema(result, "result");
  Scenario s(scenario);
  if (!result.contains("assignments"))
    throw Error("VERIFY", "/assignments", "Result has no assignments");
  auto out = response("VERIFIED");
  auto violation = [&](std::string code, std::string message) {
    out["status"] = "MODEL_INVALID";
    out["diagnostics"].push_back(
        {{"code", code}, {"path", "/assignments"}, {"message", message}});
  };
  try {
    resolveResultWeeks(s, result);
  } catch (const Error &e) {
    violation(e.code, e.what());
    return out;
  }
  std::map<std::string, int> employees, shifts;
  for (size_t e = 0; e < s.employees.size(); ++e)
    employees[s.employees[e].id] = int(e);
  for (size_t t = 0; t < s.shifts.size(); ++t)
    shifts[s.shifts[t].id] = int(t);
  std::map<std::pair<int, int>, int> cells;
  for (auto &a : result["assignments"]) {
    auto ei = employees.find(a["employeeId"]), ti = shifts.find(a["shiftId"]);
    int d = day(a["date"]);
    if (ei == employees.end() || ti == shifts.end() || d < s.days.front() ||
        d > s.days.back()) {
      violation("ASSIGNMENT_REFERENCE",
                "Unknown employee, shift or out-of-horizon date");
      continue;
    }
    int e = ei->second, t = ti->second;
    if (!cells.emplace(std::make_pair(e, d), t).second)
      violation("DUPLICATE_ASSIGNMENT",
                "More than one assignment per employee/date");
    auto allowed = s.allowed(e, d);
    if (std::find(allowed.begin(), allowed.end(), t) == allowed.end())
      violation("FORBIDDEN_ASSIGNMENT", a.dump());
  }
  for (int d : s.days)
    for (size_t e = 0; e < s.employees.size(); ++e)
      if (s.plannable(int(e), d) && !cells.contains({int(e), d}))
        violation("MISSING_ASSIGNMENT", s.employees[e].id + " " + date(d));
  for (auto &c : s.constraints())
    for (int d : s.days)
      if (s.operational(d) && s.matches(c, d) &&
          !evaluate(s, c["expression"], d, cells))
        violation("HARD_CONSTRAINT",
                  c["id"].get<std::string>() + " " + date(d));
  for (auto &a : scenario["publishedAssignments"]) {
    int d = day(a["date"]);
    if (d < s.days.front() || d > s.days.back())
      continue;
    auto it = cells.find({employees.at(a["employeeId"]), d});
    if (it == cells.end() ||
        s.shifts[it->second].id != a["shiftId"].get<std::string>())
      violation("PUBLISHED_CHANGED", a.dump());
  }
  if (out["status"] == "VERIFIED") {
    auto extra = verifyEvolution(s, result);
    if (extra["status"] != "VERIFIED")
      return extra;
  }
  if (out["status"] == "VERIFIED") {
    auto f = fairness(s, result["assignments"]);
    out["fairness"] = f.report;
    if (result.contains("fairness") && result["fairness"] != f.report)
      violation("FAIRNESS_MISMATCH",
                "Reported quotas/debts do not match independent replay");
  }
  return out;
}
Json solve(const Json &j) {
  auto start = std::chrono::steady_clock::now();
  validate(j);
  Scenario s(j);
  auto out = response("UNKNOWN");
  auto elapsed = [&]() {
    return std::chrono::duration<double>(std::chrono::steady_clock::now() -
                                         start)
        .count();
  };
  out["metadata"] = {
      {"engineVersion", version},
      {"backendVersion", operations_research::OrToolsVersionString()},
      {"configurationHash", sha256(j.dump())},
      {"search", j["search"]},
      {"policyRevisions", Json::object()},
      {"elapsedSeconds", 0}};
  for (auto &p : s.activePolicies)
    out["metadata"]["policyRevisions"][p["id"].get<std::string>()] =
        p["revision"];
  out["phases"] = Json::array();
  for (int d : s.days)
    for (size_t e = 0; e < s.employees.size(); ++e)
      if (s.plannable(int(e), d) && s.allowed(int(e), d).empty()) {
        out["status"] = "INFEASIBLE";
        out["diagnostics"].push_back(
            {{"code", "EMPTY_ALLOWED_INTERSECTION"},
             {"path", "/allowedShifts"},
             {"message",
              s.employees[e].id + " has no admissible shift on " + date(d)}});
        out["metadata"]["elapsedSeconds"] = elapsed();
        return out;
      }
  for (int d : s.days)
    if (s.operational(d)) {
      auto options = s.weekOptions(d).value("profileIds", Json::array());
      if (options.size() != 1)
        continue;
      std::string p = options[0];
      for (auto &r : s.duties())
        if (s.matches(r, d, p) && r["comparison"] != "LE") {
          std::set<int> possible;
          for (auto &candidate : coverageCandidates(s, r, d, p)) {
            auto allowed = s.domain(candidate.employee, candidate.date,
                                    candidate.profileId);
            if (std::find(allowed.begin(), allowed.end(), candidate.shift) !=
                allowed.end())
              possible.insert(candidate.employee);
          }
          if (int(possible.size()) < r["count"].get<int>()) {
            out["status"] = "INFEASIBLE";
            out["diagnostics"].push_back(
                {{"code", "INSUFFICIENT_COVERAGE"},
                 {"path", "/dutyRequirements"},
                 {"message",
                  "Insufficient qualified physical coverage for " +
                      r["label"].get<std::string>() + " on " + date(d) + ": " +
                      std::to_string(possible.size()) + " eligible, " +
                      std::to_string(r["count"].get<int>()) + " required"},
                 {"severity", "ERROR"},
                 {"objectIds", Json::array({r["id"]})},
                 {"section", "coverage"},
                 {"suggestion",
                  "Review availability, effective hours and qualification "
                  "selectors, or explicitly configure fallback resources."}});
            out["metadata"]["elapsedSeconds"] = elapsed();
            return out;
          }
        }
    }
  Compiler c(s);
  c.assignments();
  auto stages = c.objectives();
  if (stages.empty())
    stages.push_back(
        {"", "FEASIBILITY", operations_research::sat::LinearExpr(0), 1});
  operations_research::sat::CpSolverResponse incumbent;
  bool hasSolution = false, allOptimal = true;
  double budget = j["search"]["maxTimeSeconds"];
  for (auto &stage : stages) {
    double remaining = budget - elapsed();
    if (remaining <= 0) {
      allOptimal = false;
      out["phases"].push_back({{"policyId", stage.policyId},
                               {"metric", stage.metric},
                               {"status", "UNKNOWN"},
                               {"reason", "Global time budget exhausted"}});
      break;
    }
    c.model.Minimize(stage.value);
    operations_research::sat::SatParameters parameters;
    parameters.set_max_time_in_seconds(remaining);
    parameters.set_random_seed(j["search"]["seed"]);
    parameters.set_num_search_workers(j["search"]["workers"]);
    parameters.set_log_search_progress(false);
    auto r = operations_research::sat::SolveWithParameters(c.model.Build(),
                                                           parameters);
    auto status = operations_research::sat::CpSolverStatus_Name(r.status());
    Json phase = {{"policyId", stage.policyId},
                  {"metric", stage.metric},
                  {"status", status},
                  {"elapsedSeconds", r.wall_time()},
                  {"scale", stage.scale},
                  {"bestBoundScaled", r.best_objective_bound()}};
    if (r.status() == operations_research::sat::CpSolverStatus::OPTIMAL ||
        r.status() == operations_research::sat::CpSolverStatus::FEASIBLE) {
      incumbent = r;
      hasSolution = true;
      auto value =
          operations_research::sat::SolutionIntegerValue(r, stage.value);
      phase["valueScaled"] = value;
      phase["value"] = Rational(value, stage.scale).json();
      c.model.AddEquality(stage.value, value);
    }
    out["phases"].push_back(phase);
    if (r.status() == operations_research::sat::CpSolverStatus::INFEASIBLE) {
      out["status"] = "INFEASIBLE";
      Json core = Json::array();
      for (auto index : r.sufficient_assumptions_for_infeasibility())
        if (c.assumptionLabels.contains(index))
          core.push_back(c.assumptionLabels.at(index));
      out["diagnostics"].push_back(
          {{"code", "HARD_CONFLICT"},
           {"path", "/constraints"},
           {"message", "Hard constraints are incompatible. Assumption set is "
                       "sufficient, not necessarily minimal: " +
                           core.dump()}});
      out["metadata"]["elapsedSeconds"] = elapsed();
      return out;
    }
    if (r.status() == operations_research::sat::CpSolverStatus::MODEL_INVALID) {
      out["status"] = "MODEL_INVALID";
      out["diagnostics"].push_back({{"code", "CP_SAT_MODEL"},
                                    {"path", "/"},
                                    {"message", r.solution_info()}});
      out["metadata"]["elapsedSeconds"] = elapsed();
      return out;
    }
    if (r.status() != operations_research::sat::CpSolverStatus::OPTIMAL) {
      allOptimal = false;
      break;
    }
  }
  if (hasSolution) {
    out["status"] = allOptimal ? "OPTIMAL" : "FEASIBLE";
    out["weekAssignments"] = Json::array();
    for (int w : s.weeks()) {
      auto options = s.weekOptions(w);
      auto profileIds = options["profileIds"];
      options.erase("profileIds");
      for (auto &p : profileIds) {
        std::string pid = p;
        if (operations_research::sat::SolutionBooleanValue(incumbent,
                                                           c.week(w, pid))) {
          s.selectedWeeks[w] = pid;
          options["profileId"] = pid;
          out["weekAssignments"].push_back(options);
        }
      }
    }
    out["assignments"] = Json::array();
    for (auto &[key, v] : c.x)
      if (operations_research::sat::SolutionBooleanValue(incumbent, v)) {
        auto [e, d, t] = key;
        out["assignments"].push_back({{"employeeId", s.employees[e].id},
                                      {"date", date(d)},
                                      {"shiftId", s.shifts[t].id}});
        auto concrete = s.intervals(e, d, t);
        out["assignments"].back()["intervals"] = concrete["intervals"];
        out["assignments"].back()["variantId"] = concrete["id"];
        if (!s.profile(d).empty())
          out["assignments"].back()["weekProfileId"] = s.profile(d);
      }
    out["calendarStates"] = Json::array();
    for (int d : s.days)
      for (size_t e = 0; e < s.employees.size(); ++e)
        if (!s.plannable(int(e), d))
          out["calendarStates"].push_back(
              {{"employeeId", s.employees[e].id},
               {"date", date(d)},
               {"state", !s.active(int(e), d)  ? "INACTIVE"
                         : s.excluded(d)       ? "EXCLUDED"
                         : s.closed(int(e), d) ? "CLOSED"
                                               : "ABSENT"}});
    out["calendarDays"] = Json::array();
    for (int d : s.days)
      out["calendarDays"].push_back({{"date", date(d)},
                                     {"profileId", s.profile(d)},
                                     {"holidays", s.holiday(d)}});
    Json choices = Json::array();
    for (auto &[choice, variable] : c.coverageDecisions)
      if (operations_research::sat::SolutionBooleanValue(incumbent, variable))
        choices.push_back(choice);
    out["coverage"] = scheduleCoverage(s, out["assignments"], choices);
    out["fairness"] = fairness(s, out["assignments"]).report;
    auto checkedResult = verify(j, out);
    if (checkedResult["status"] != "VERIFIED") {
      out["status"] = "MODEL_INVALID";
      out["diagnostics"] = checkedResult["diagnostics"];
    }
  }
  out["metadata"]["elapsedSeconds"] = elapsed();
  return out;
}
} // namespace rostercore
