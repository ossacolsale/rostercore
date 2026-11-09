// Included only inside the CP-SAT adapter's Compiler; no backend types escape.
std::map<std::pair<int, std::string>, BoolVar> weekly;
std::vector<std::pair<Json, BoolVar>> coverageDecisions;
std::map<std::tuple<int, int, int>, std::vector<BoolVar>> dutyBindings;
std::map<std::tuple<int, int, int>, std::vector<BoolVar>> bindingGates;
std::vector<IntVar> calendarPenalties;
std::map<std::pair<int, int>, std::vector<BoolVar>> fallback;
std::map<std::tuple<std::string, int, int>, std::vector<BoolVar>> exclusive;
BoolVar week(int d, const std::string &p) {
  auto key = std::make_pair(isoMonday(d), p);
  if (!weekly.contains(key)) {
    auto b = model.NewBoolVar();
    bool fixed = d < s.days.front() || d > s.days.back();
    auto options = s.weekOptions(d).value("profileIds", Json::array());
    model.AddEquality(b,
                      fixed && options.size() == 1 && options[0] == p ? 1 : 0);
    weekly[key] = b;
  }
  return weekly.at(key);
}
BoolVar conjunction(const std::vector<BoolVar> &children) {
  auto b = model.NewBoolVar();
  model.AddBoolAnd(children).OnlyEnforceIf(b);
  std::vector<BoolVar> nots;
  for (auto c : children)
    nots.push_back(c.Not());
  model.AddBoolOr(nots).OnlyEnforceIf(b.Not());
  return b;
}
BoolVar assigned(int e, int d, int t) {
  auto it = x.find({e, d, t});
  if (it != x.end())
    return it->second;
  bool historic = false;
  for (auto &a : knownAssignments(s))
    if (a["employeeId"] == s.employees[e].id && day(a["date"]) == d &&
        a["shiftId"] == s.shifts[t].id)
      historic = true;
  auto b = model.NewBoolVar();
  model.AddEquality(b, historic ? 1 : 0);
  return b;
}
void calendar() {
  std::set<int> known;
  for (int w : s.weeks()) {
    auto options = s.weekOptions(w);
    std::vector<BoolVar> vars;
    for (auto &p : options["profileIds"]) {
      auto v = model.NewBoolVar();
      weekly[{w, p.get<std::string>()}] = v;
      vars.push_back(v);
    }
    model.AddExactlyOne(vars);
    known.insert(w);
  }
  auto config = s.source.value("weekConfiguration", Json::object());
  for (auto &h : config.value("history", Json::array())) {
    int w = isoMonday(day(h["week"]));
    known.insert(w);
    if (w < s.weeks().front() || w > s.weeks().back()) {
      auto v = model.NewBoolVar();
      model.AddEquality(v, 1);
      weekly[{w, h["profileId"].get<std::string>()}] = v;
    }
  }
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
  for (auto &f : config.value("frequencies", Json::array())) {
    std::string id = f["profileId"];
    for (int w : known) {
      if (f.contains("minGapWeeks"))
        for (int prev : known)
          if (prev < w && (w - prev) / 7 < f["minGapWeeks"].get<int>() &&
              (w >= s.weeks().front() || prev >= s.weeks().front()) &&
              !waived(f, {prev, w}))
            model.AddLessOrEqual(LinearExpr(week(prev, id)) + week(w, id), 1);
      for (auto mode : {"COUNT", "GAP"}) {
        int n = std::string(mode) == "COUNT" ? f.value("windowWeeks", 0)
                                             : f.value("maxGapWeeks", 0);
        if (!n)
          continue;
        std::vector<int> window;
        bool complete = true, current = false;
        LinearExpr sum;
        for (int k = 0; k < n; ++k) {
          int at = w - 7 * k;
          if (!known.contains(at)) {
            complete = false;
            break;
          }
          window.push_back(at);
          current |= at >= s.weeks().front();
          sum += week(at, id);
        }
        if (!complete || !current)
          continue;
        if (!waived(f, window)) {
          if (std::string(mode) == "GAP")
            model.AddGreaterOrEqual(sum, 1);
          else {
            if (f.contains("minCount"))
              model.AddGreaterOrEqual(sum, f["minCount"].get<int>());
            if (f.contains("maxCount"))
              model.AddLessOrEqual(sum, f["maxCount"].get<int>());
          }
        }
        if (std::string(mode) == "COUNT" && f.contains("desiredCount")) {
          auto abs =
              model.NewIntVar(Domain(0, n + f["desiredCount"].get<int>()));
          model.AddAbsEquality(abs, sum - f["desiredCount"].get<int>());
          calendarPenalties.push_back(abs);
        }
      }
      if (f.contains("desiredGapWeeks"))
        for (int prev : known)
          if (prev < w && w >= s.weeks().front()) {
            std::vector<BoolVar> adjacent{week(prev, id), week(w, id)};
            bool complete = true;
            for (int at = prev + 7; at < w; at += 7) {
              if (!known.contains(at)) {
                complete = false;
                break;
              }
              adjacent.push_back(week(at, id).Not());
            }
            if (!complete)
              continue;
            int cost =
                std::abs((w - prev) / 7 - f["desiredGapWeeks"].get<int>());
            auto selected = conjunction(adjacent);
            auto v = model.NewIntVar(Domain(0, cost));
            model.AddEquality(v, cost).OnlyEnforceIf(selected);
            model.AddEquality(v, 0).OnlyEnforceIf(selected.Not());
            calendarPenalties.push_back(v);
          }
    }
  }
}
void advanced() {
  for (auto &r : s.duties())
    for (int d : s.days)
      if (s.operational(d))
        for (auto &pjson :
             s.weekOptions(d).value("profileIds", Json::array())) {
          std::string p = pjson;
          if (!s.matches(r, d, p))
            continue;
          auto gate = week(d, p);
          auto candidates = coverageCandidates(s, r, d, p);
          std::vector<std::pair<CoverageCandidate, BoolVar>> vars;
          for (auto &candidate : candidates) {
            auto eligible = conjunction(
                {assigned(candidate.employee, candidate.date, candidate.shift),
                 week(candidate.date, candidate.profileId), gate});
            auto variable = eligible;
            if (r["mode"] == "RESPONSIBILITY") {
              variable = model.NewBoolVar();
              model.AddImplication(variable, eligible);
              coverageDecisions.push_back(
                  {{{"requirementId", r["id"]},
                    {"date", date(d)},
                    {"employeeId", s.employees[candidate.employee].id},
                    {"sourceDate", date(candidate.date)},
                    {"shiftId", s.shifts[candidate.shift].id}},
                   variable});
              dutyBindings[{candidate.employee, candidate.date,
                            candidate.shift}]
                  .push_back(variable);
            }
            vars.push_back({candidate, variable});
            if (candidate.level > 0)
              fallback[{r["preferencePriority"].get<int>(), candidate.level}]
                  .push_back(variable);
            if (r.contains("exclusiveGroup") && r["mode"] == "RESPONSIBILITY")
              exclusive[{r["exclusiveGroup"].get<std::string>(), d,
                         candidate.employee}]
                  .push_back(variable);
          }
          if (r["mode"] == "RESPONSIBILITY" && r.value("bindAssignments", true))
            for (size_t e = 0; e < s.employees.size(); ++e)
              for (size_t t = 0; t < s.shifts.size(); ++t)
                if (std::find(r["shiftIds"].begin(), r["shiftIds"].end(),
                              s.shifts[t].id) != r["shiftIds"].end() &&
                    x.contains({int(e), d, int(t)}))
                  bindingGates[{int(e), d, int(t)}].push_back(gate);
          auto constrain = [&](const LinearExpr &sum) {
            auto truth = atom(sum, r["comparison"], r["count"]);
            auto assumption = model.NewBoolVar();
            model.AddBoolOr({gate.Not(), truth}).OnlyEnforceIf(assumption);
            model.AddAssumption(assumption);
            assumptionLabels[assumption.index()] = {{"requirementId", r["id"]},
                                                    {"date", date(d)},
                                                    {"profileId", p}};
          };
          if (r["mode"] == "RESPONSIBILITY") {
            LinearExpr sum;
            for (auto &v : vars)
              sum += v.second;
            constrain(sum);
          } else {
            auto required = requirementSpans(s, r, d);
            std::set<int64_t> points;
            for (auto &range : required) {
              points.insert(range.first);
              points.insert(range.second);
            }
            for (auto &[candidate, v] : vars) {
              (void)v;
              for (auto &span : candidate.intervals) {
                points.insert(span.first);
                points.insert(span.second);
              }
            }
            std::vector<int64_t> ordered(points.begin(), points.end());
            for (size_t k = 1; k < ordered.size(); ++k) {
              int64_t a = ordered[k - 1], b = ordered[k];
              bool needed = false;
              for (auto &range : required)
                if (a >= range.first && b <= range.second)
                  needed = true;
              if (!needed)
                continue;
              LinearExpr sum;
              for (auto &[candidate, v] : vars) {
                bool covers = false;
                for (auto &span : candidate.intervals)
                  if (span.first <= a && span.second >= b)
                    covers = true;
                if (covers)
                  sum += v;
              }
              constrain(sum);
            }
          }
        }
  if (s.source.value("dutyBindingMode", "ACTIVE_SCOPE") == "GLOBAL")
    for (auto &[key, v] : x) {
      auto [e, d, t] = key;
      (void)e;
      (void)d;
      bool binding = false;
      for (auto &r : s.duties())
        if (r["mode"] == "RESPONSIBILITY" && r.value("bindAssignments", true) &&
            std::find(r["shiftIds"].begin(), r["shiftIds"].end(),
                      s.shifts[t].id) != r["shiftIds"].end())
          binding = true;
      if (binding) {
        LinearExpr claimed;
        for (auto choice : dutyBindings[key])
          claimed += choice;
        model.AddLessOrEqual(v, claimed);
      }
    }
  for (auto &[key, gates] : bindingGates) {
    LinearExpr claimed;
    for (auto v : dutyBindings[key])
      claimed += v;
    for (auto gate : gates)
      model.AddLessOrEqual(x.at(key), claimed).OnlyEnforceIf(gate);
  }
  for (auto &[key, vars] : exclusive) {
    (void)key;
    LinearExpr sum;
    for (auto v : vars)
      sum += v;
    model.AddLessOrEqual(sum, 1);
  }
  int maxOffset = 1;
  for (auto &r : s.transitions())
    maxOffset =
        std::max(maxOffset, r["type"] == "MIN_REST"
                                ? r["minimumMinutes"].get<int>() / 1440 + 2
                                : r["offsetDays"].get<int>());
  for (int d = s.days.front() - maxOffset; d <= s.days.back(); ++d)
    for (int delta = 1; delta <= maxOffset; ++delta) {
      int next = d + delta;
      if (next < s.days.front() || next > s.days.back())
        continue;
      auto known = knownAssignments(s);
      if (d < s.days.front() &&
          std::none_of(
              known.begin(), known.end(),
              [&](const Json &a) { return day(a["date"]) == d; }))
        continue;
      for (size_t e = 0; e < s.employees.size(); ++e)
        for (auto &pj : s.weekOptions(d).value("profileIds", Json::array()))
          for (auto &qj :
               s.weekOptions(next).value("profileIds", Json::array())) {
            std::string p = pj, q = qj;
            if (isoMonday(d) == isoMonday(next) && p != q)
              continue;
            for (size_t a = 0; a < s.shifts.size(); ++a)
              for (size_t b = 0; b < s.shifts.size(); ++b) {
                if (!x.contains({int(e), next, int(b)}))
                  continue;
                bool previous = x.contains({int(e), d, int(a)});
                if (d < s.days.front())
                  for (auto &h : knownAssignments(s))
                    if (h["employeeId"] == s.employees[e].id &&
                        day(h["date"]) == d && h["shiftId"] == s.shifts[a].id)
                      previous = true;
                if (!previous)
                  continue;
                if (!temporalCompatible(s, int(e), d, int(a), next, int(b), p,
                                        q))
                  model
                      .AddLessOrEqual(LinearExpr(assigned(int(e), d, int(a))) +
                                          assigned(int(e), next, int(b)),
                                      1)
                      .OnlyEnforceIf({week(d, p), week(next, q)});
              }
          }
    }
  for (auto &r : s.source["allowedShifts"])
    if (r.value("allowRequiredRest", false))
      for (int d : s.days)
        for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
          std::string p = pj;
          if (!s.matches(r, d, p))
            continue;
          for (int e : s.select(r["selector"], d, {}, p))
            for (size_t t = 0; t < s.shifts.size(); ++t)
              if (s.shifts[t].kind == "OFF" &&
                  std::find(r["shiftIds"].begin(), r["shiftIds"].end(),
                            s.shifts[t].id) == r["shiftIds"].end() &&
                  x.contains({e, d, int(t)})) {
                LinearExpr required;
                bool hasPrevious = d - 1 >= s.days.front();
                for (auto &a : knownAssignments(s))
                  if (a["employeeId"] == s.employees[e].id &&
                      day(a["date"]) == d - 1)
                    hasPrevious = true;
                if (hasPrevious)
                  for (auto &prior : s.weekOptions(d - 1).value(
                           "profileIds", Json::array())) {
                    std::string previousProfile = prior;
                    if (isoMonday(d - 1) == isoMonday(d) &&
                        previousProfile != p)
                      continue;
                    for (auto &rule : s.transitions())
                      if (rule["type"] == "SUCCESSION" &&
                          rule["offsetDays"] == 1 &&
                          s.matches(rule, d - 1, previousProfile)) {
                        auto members = s.select(rule["selector"], d - 1, {},
                                                previousProfile);
                        if (std::find(members.begin(), members.end(), e) ==
                            members.end())
                          continue;
                        if (std::find(rule["toShiftIds"].begin(),
                                      rule["toShiftIds"].end(),
                                      s.shifts[t].id) !=
                            rule["toShiftIds"].end())
                          for (auto &id : rule["fromShiftIds"])
                            required +=
                                conjunction({assigned(e, d - 1, shifts.at(id)),
                                             week(d - 1, previousProfile)});
                      }
                  }
                model.AddLessOrEqual(x.at({e, d, int(t)}), required)
                    .OnlyEnforceIf(week(d, p));
              }
        }
}
std::vector<Stage> preferredStages() {
  std::vector<Stage> out;
  std::map<int, std::set<int>> levels;
  for (auto &[key, vars] : fallback) {
    (void)vars;
    levels[key.first].insert(key.second);
  }
  for (auto &[priority, available] : levels)
    for (auto it = available.rbegin(); it != available.rend(); ++it) {
      LinearExpr value;
      for (auto &[key, vars] : fallback)
        if (key.first == priority && key.second >= *it)
          for (auto v : vars)
            value += v;
      out.push_back({"coverage:" + std::to_string(priority),
                     "FALLBACK_LEVEL_" + std::to_string(*it), value, 1});
    }
  if (!calendarPenalties.empty()) {
    LinearExpr sum;
    for (auto v : calendarPenalties)
      sum += v;
    out.push_back({"calendar", "DESIRED_WEEK_FREQUENCY", sum, 1});
  }
  return out;
}
Stage stability() {
  LinearExpr cost;
  if (s.source.contains("replanning")) {
    auto &r = s.source["replanning"];
    std::set<std::pair<int, int>> baseline;
    for (auto &a : r["baseline"]) {
      int d = day(a["date"]);
      if (d < day(r["from"]) || d < s.days.front() || d > s.days.back())
        continue;
      int e = employees.at(a["employeeId"]), t = shifts.at(a["shiftId"]);
      baseline.insert({e, d});
      cost += 1;
      if (x.contains({e, d, t})) {
        if (!a.contains("intervals"))
          cost -= x.at({e, d, t});
        else
          for (auto &pj : s.weekOptions(d).value("profileIds", Json::array())) {
            std::string p = pj;
            auto concrete = s.intervals(e, d, t, p);
            if (!concrete.is_null() && concrete["intervals"] == a["intervals"])
              cost -= conjunction({x.at({e, d, t}), week(d, p)});
          }
      }
    }
    for (int d : s.days)
      if (d >= day(r["from"]))
        for (size_t e = 0; e < s.employees.size(); ++e)
          if (s.plannable(int(e), d) && !baseline.contains({int(e), d}))
            cost += 1;
  }
  return {"regeneration", "SCHEDULE_CHANGES", cost, 1};
}

LinearExpr burden(int e, int d, const Json &r) {
  LinearExpr sum;
  for (size_t t = 0; t < s.shifts.size(); ++t)
    if (targetShift(s, r, int(t)))
      sum += assigned(e, d, int(t));
  return sum;
}
LinearExpr normalBetween(int e, int first, int second, const Json &r) {
  LinearExpr n;
  for (int d = first + 1; d < second; ++d)
    for (auto &id : r["normalShiftIds"])
      n += assigned(e, d, shifts.at(id));
  return n;
}
std::vector<Stage> spacing(bool hard) {
  std::vector<Stage> stages;
  for (auto &r : s.source.value("spacingRules", Json::array())) {
    if ((r["mode"] == "HARD") != hard)
      continue;
    LinearExpr total;
    int gap = r["minimumGap"];
    for (auto &pair : spacingPairs(s, r)) {
      auto both =
          conjunction({atom(burden(pair.employee, pair.first, r), "EQ", 1),
                       atom(burden(pair.employee, pair.second, r), "EQ", 1),
                       week(pair.second, pair.profile)});
      LinearExpr distance =
          r["unit"] == "CALENDAR"
              ? LinearExpr(pair.second - pair.first)
              : normalBetween(pair.employee, pair.first, pair.second, r);
      if (hard)
        model.AddGreaterOrEqual(distance, gap).OnlyEnforceIf(both);
      else if (r["penalty"] == "CLOSE_PAIRS")
        total += conjunction({both, atom(distance, "LE", gap - 1)});
      else {
        auto deficit = model.NewIntVar(Domain(0, gap));
        model.AddMaxEquality(deficit,
                             {LinearExpr(0), LinearExpr(gap) - distance});
        auto cost = model.NewIntVar(Domain(0, gap));
        model.AddEquality(cost, deficit).OnlyEnforceIf(both);
        model.AddEquality(cost, 0).OnlyEnforceIf(both.Not());
        total += cost;
      }
    }
    if (!hard)
      stages.push_back(
          {"spacing:" + r["id"].get<std::string>(), r["penalty"], total, 1});
  }
  return stages;
}
