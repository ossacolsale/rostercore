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
int minute(const Json &t) {
  auto s = t.get<std::string>();
  return std::stoi(s.substr(0, 2)) * 60 + std::stoi(s.substr(3, 2));
}
bool overlap(const Shift &a, const Shift &b) {
  for (auto &i : a.intervals)
    for (auto &j : b.intervals) {
      int a0 = minute(i["start"]),
          a1 = minute(i["end"]) + 1440 * i["endDayOffset"].get<int>();
      int b0 = 1440 + minute(j["start"]),
          b1 = 1440 + minute(j["end"]) + 1440 * j["endDayOffset"].get<int>();
      if (std::max(a0, b0) < std::min(a1, b1))
        return true;
    }
  return false;
}
struct Compiler {
  const Scenario &s;
  CpModelBuilder model;
  std::map<std::tuple<int, int, int>, BoolVar> x;
  std::map<std::string, int> shifts, employees;
  std::map<int, Json> assumptionLabels;
  explicit Compiler(const Scenario &scenario) : s(scenario) {
    for (size_t t = 0; t < s.shifts.size(); ++t)
      shifts[s.shifts[t].id] = int(t);
    for (size_t e = 0; e < s.employees.size(); ++e)
      employees[s.employees[e].id] = int(e);
  }
  LinearExpr count(const Json &selector, const std::set<int> &ts, int d) {
    LinearExpr sum;
    for (int e : s.select(selector))
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
  BoolVar expression(const Json &exp, int d, const std::set<int> &branch = {}) {
    std::string op = exp["op"];
    if (op == "COUNT")
      return atom(count(exp["selector"], {shifts.at(exp["shiftId"])}, d),
                  exp["comparison"], exp["count"]);
    if (op == "REMAINING") {
      std::set<int> forbidden;
      for (size_t t = 0; t < s.shifts.size(); ++t)
        if (!branch.contains(int(t)) && int(t) != shifts.at(exp["shiftId"]))
          forbidden.insert(int(t));
      return atom(count(exp["selector"], forbidden, d), "EQ", 0);
    }
    std::set<int> local;
    for (auto &c : exp["children"])
      if (c["op"] == "COUNT")
        local.insert(shifts.at(c["shiftId"]));
    std::vector<BoolVar> children, negated;
    for (auto &c : exp["children"]) {
      auto v = expression(c, d, local);
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
    for (int d : s.days)
      for (size_t e = 0; e < s.employees.size(); ++e) {
        if (s.excluded(d) || s.absent(int(e), d))
          continue;
        std::vector<BoolVar> vars;
        for (int t : s.allowed(int(e), d)) {
          auto v = model.NewBoolVar();
          x[{int(e), d, t}] = v;
          vars.push_back(v);
        }
        model.AddExactlyOne(vars);
      }
    for (auto &c : s.constraints())
      for (int d : s.days)
        if (!s.excluded(d) && applies(c, d)) {
          auto root = expression(c["expression"], d);
          model.AddAssumption(root);
          assumptionLabels[root.index()] = {{"constraintId", c["id"]},
                                            {"date", date(d)}};
        }
    for (auto &a : s.source["publishedAssignments"]) {
      int d = day(a["date"]);
      if (d < s.days.front() || d > s.days.back())
        continue;
      auto it =
          x.find({employees.at(a["employeeId"]), d, shifts.at(a["shiftId"])});
      if (it == x.end())
        model.AddBoolOr({});
      else
        model.AddEquality(it->second, 1);
    }
    for (int d : s.days)
      for (size_t e = 0; e < s.employees.size(); ++e)
        for (size_t a = 0; a < s.shifts.size(); ++a)
          for (size_t b = 0; b < s.shifts.size(); ++b)
            if (overlap(s.shifts[a], s.shifts[b])) {
              auto i = x.find({int(e), d, int(a)}),
                   j = x.find({int(e), d + 1, int(b)});
              if (i != x.end() && j != x.end())
                model.AddLessOrEqual(LinearExpr(i->second) + j->second, 1);
            }
    for (auto &a : s.source["history"]["assignments"])
      if (day(a["date"]) == s.days.front() - 1) {
        int e = employees.at(a["employeeId"]), t = shifts.at(a["shiftId"]);
        for (size_t b = 0; b < s.shifts.size(); ++b)
          if (overlap(s.shifts[t], s.shifts[b])) {
            auto it = x.find({e, s.days.front(), int(b)});
            if (it != x.end())
              model.AddEquality(it->second, 0);
          }
      }
  }
  struct Stage {
    std::string policyId, metric;
    LinearExpr value;
    int64_t scale;
  };
  std::vector<Stage> objectives() {
    std::vector<Stage> stages;
    for (auto &p : s.activePolicies) {
      auto &o = p["objective"];
      auto selected = s.select(o["selector"]);
      auto ledger = historicalLedger(s, o);
      int64_t scale = 1;
      for (int e : selected)
        scale = lcm(scale, ledger.ideal[e].d);
      std::map<int, std::map<int, int64_t>> weights;
      std::map<int, int64_t> denominators;
      int applicableDays = 0;
      for (int d : s.days)
        if (!s.excluded(d) && applies(o, d)) {
          ++applicableDays;
          weights[d] = participants(s, o, d);
          int64_t total = 0;
          for (auto &[e, w] : weights[d]) {
            (void)e;
            total = checked(total, w);
          }
          denominators[d] = total;
          if (total)
            scale = lcm(scale, total);
        }
      int64_t bound = checked(
          int64_t(s.days.size()) * int64_t(selected.size()) + 1, scale, true);
      for (int e : selected)
        bound = checked(bound, checked(std::abs(ledger.ideal[e].n),
                                       scale / ledger.ideal[e].d, true) +
                                   checked(ledger.actual[e], scale, true));
      checked(bound,
              std::max<int64_t>(1, int64_t(applicableDays) *
                                       int64_t(selected.size())),
              true);
      std::map<int, LinearExpr> debt;
      for (int e : selected)
        debt[e] = checked(ledger.ideal[e].n, scale / ledger.ideal[e].d, true) -
                  checked(ledger.actual[e], scale, true);
      std::set<int> targets;
      for (size_t t = 0; t < s.shifts.size(); ++t)
        if (targetShift(s, o, int(t)))
          targets.insert(int(t));
      std::vector<IntVar> absolutePrefixes;
      std::map<int, IntVar> last;
      int64_t historicalTotal = 0;
      for (int e : selected)
        historicalTotal = checked(historicalTotal, ledger.actual[e]);
      bool uniform = o["participation"] == "EQUAL";
      for (int e : selected) {
        auto expected = Rational(historicalTotal, int64_t(selected.size()));
        uniform &=
            ledger.ideal[e].n == expected.n && ledger.ideal[e].d == expected.d;
      }
      LinearExpr cumulativeProduced(historicalTotal);
      for (int d : s.days) {
        if (s.excluded(d) || !applies(o, d))
          continue;
        auto produced = count(o["selector"], targets, d);
        auto denominator = denominators[d];
        if (denominator == 0)
          model.AddEquality(produced, 0);
        cumulativeProduced += produced;
        LinearExpr prefixAbs;
        for (int e : selected) {
          if (weights[d].contains(e))
            debt[e] +=
                produced * checked(scale / denominator, weights[d][e], true);
          debt[e] -=
              count(Json{{"employeeIds", Json::array({s.employees[e].id})}},
                    targets, d) *
              scale;
          auto abs = model.NewIntVar(Domain(0, bound));
          model.AddAbsEquality(abs, debt[e]);
          absolutePrefixes.push_back(abs);
          prefixAbs += abs;
          last.insert_or_assign(e, abs);
        }
        if (uniform) {
          int64_t n = int64_t(selected.size());
          auto remainder = model.NewIntVar(Domain(0, n - 1)),
               lower = model.NewIntVar(Domain(0, bound));
          model.AddModuloEquality(remainder, cumulativeProduced, n);
          auto table = model.AddAllowedAssignments({remainder, lower});
          for (int64_t r = 0; r < n; ++r)
            table.AddTuple({r, checked(2 * r * (n - r), scale / n, true)});
          model.AddGreaterOrEqual(prefixAbs, lower);
        }
      }
      auto max = model.NewIntVar(Domain(0, bound));
      if (absolutePrefixes.empty())
        model.AddEquality(max, 0);
      else
        model.AddMaxEquality(max, absolutePrefixes);
      LinearExpr sum, final;
      for (auto &v : absolutePrefixes)
        sum += v;
      for (int e : selected) {
        if (!last.contains(e)) {
          auto abs = model.NewIntVar(Domain(0, bound));
          model.AddAbsEquality(abs, debt[e]);
          last.insert_or_assign(e, abs);
        }
        final += last.at(e);
      }
      for (auto &m : o["metrics"]) {
        std::string metric = m;
        stages.push_back(
            {p["id"], metric,
             metric == "MAX_ABSOLUTE_PREFIX_DEVIATION"
                 ? LinearExpr(max)
                 : (metric == "SUM_ABSOLUTE_PREFIX_DEVIATIONS" ? sum : final),
             scale});
      }
    }
    return stages;
  }
};
} // namespace
bool evaluate(const Scenario &s, const Json &exp, int d,
              const std::map<std::pair<int, int>, int> &assignments) {
  std::string op = exp["op"];
  if (op == "COUNT") {
    int n = 0;
    for (int e : s.select(exp["selector"])) {
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
        for (int e : s.select(c["selector"])) {
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
      if (!s.excluded(d) && !s.absent(int(e), d) &&
          !cells.contains({int(e), d}))
        violation("MISSING_ASSIGNMENT", s.employees[e].id + " " + date(d));
  for (auto &c : s.constraints())
    for (int d : s.days)
      if (!s.excluded(d) && applies(c, d) &&
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
  auto boundary = cells;
  for (auto &a : scenario["history"]["assignments"])
    if (day(a["date"]) == s.days.front() - 1)
      boundary[{employees.at(a["employeeId"]), day(a["date"])}] =
          shifts.at(a["shiftId"]);
  for (auto &[key, t] : boundary) {
    auto it = boundary.find({key.first, key.second + 1});
    if (it != boundary.end() && overlap(s.shifts[t], s.shifts[it->second]))
      violation("OVERLAPPING_WORK",
                s.employees[key.first].id + " " + date(key.second));
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
      if (!s.excluded(d) && !s.absent(int(e), d) &&
          s.allowed(int(e), d).empty()) {
        out["status"] = "INFEASIBLE";
        out["diagnostics"].push_back(
            {{"code", "EMPTY_ALLOWED_INTERSECTION"},
             {"path", "/allowedShifts"},
             {"message",
              s.employees[e].id + " has no admissible shift on " + date(d)}});
        out["metadata"]["elapsedSeconds"] = elapsed();
        return out;
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
    out["assignments"] = Json::array();
    for (auto &[key, v] : c.x)
      if (operations_research::sat::SolutionBooleanValue(incumbent, v)) {
        auto [e, d, t] = key;
        out["assignments"].push_back({{"employeeId", s.employees[e].id},
                                      {"date", date(d)},
                                      {"shiftId", s.shifts[t].id}});
      }
    out["calendarStates"] = Json::array();
    for (int d : s.days)
      for (size_t e = 0; e < s.employees.size(); ++e)
        if (s.excluded(d) || s.absent(int(e), d))
          out["calendarStates"].push_back(
              {{"employeeId", s.employees[e].id},
               {"date", date(d)},
               {"state", s.excluded(d) ? "EXCLUDED" : "ABSENT"}});
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
