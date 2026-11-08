#include "rostercore/core.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <limits>
#include <numeric>
namespace rostercore {
int64_t checked(int64_t a, int64_t b, bool multiply) {
  constexpr int64_t limit = 1000000000000LL;
  if (a < -limit || a > limit || b < -limit || b > limit)
    throw Error("NUMERIC_LIMIT", "/", "Exact arithmetic exceeds safe range");
  if (multiply) {
    if (a != 0 && (b > limit / std::max<int64_t>(1, std::abs(a)) ||
                   b < -limit / std::max<int64_t>(1, std::abs(a))))
      throw Error("NUMERIC_LIMIT", "/", "Exact arithmetic exceeds safe range");
    a *= b;
  } else {
    if ((b > 0 && a > limit - b) || (b < 0 && a < -limit - b))
      throw Error("NUMERIC_LIMIT", "/", "Exact arithmetic exceeds safe range");
    a += b;
  }
  if (a > limit || a < -limit)
    throw Error("NUMERIC_LIMIT", "/", "Exact arithmetic exceeds safe range");
  return a;
}
int64_t lcm(int64_t a, int64_t b) {
  return checked(a / std::gcd(a, b), b, true);
}
Rational::Rational(int64_t numerator, int64_t denominator)
    : n(numerator), d(denominator) {
  if (d <= 0 || d > 1000000000000LL || n < -1000000000000LL ||
      n > 1000000000000LL)
    throw Error("NUMERIC_LIMIT", "/", "Invalid rational denominator");
  auto g = std::gcd(n, d);
  n /= g;
  d /= g;
}
Rational Rational::operator+(const Rational &r) const {
  auto m = lcm(d, r.d);
  return {checked(checked(n, m / d, true), checked(r.n, m / r.d, true)), m};
}
Rational Rational::operator-(const Rational &r) const {
  return *this + Rational(-r.n, r.d);
}
Json Rational::json() const { return {{"numerator", n}, {"denominator", d}}; }
int day(const std::string &value) {
  int y = 0, m = 0, d = 0;
  char tail = 0;
  if (value.size() != 10 ||
      std::sscanf(value.c_str(), "%4d-%2d-%2d%c", &y, &m, &d, &tail) != 3 ||
      y < 1900 || y > 2200)
    throw Error("DATE", "/calendar",
                "Expected a Gregorian date between 1900 and 2200: " + value);
  std::chrono::year_month_day civil{std::chrono::year(y),
                                    std::chrono::month(unsigned(m)),
                                    std::chrono::day(unsigned(d))};
  if (!civil.ok())
    throw Error("DATE", "/calendar", "Invalid date: " + value);
  auto result = int(std::chrono::sys_days(civil).time_since_epoch().count());
  if (date(result) != value)
    throw Error("DATE", "/calendar", "Date must use YYYY-MM-DD");
  return result;
}
std::string date(int d) {
  auto c =
      std::chrono::year_month_day(std::chrono::sys_days(std::chrono::days(d)));
  char out[16];
  std::snprintf(out, sizeof(out), "%04d-%02u-%02u", int(c.year()),
                unsigned(c.month()), unsigned(c.day()));
  return out;
}
int weekday(int d) {
  return int(std::chrono::weekday(std::chrono::sys_days(std::chrono::days(d)))
                 .iso_encoding());
}
std::string isoWeek(int d) {
  int thursday = d + 4 - weekday(d);
  int y = int(std::chrono::year_month_day(
                  std::chrono::sys_days(std::chrono::days(thursday)))
                  .year());
  int jan4 = day(std::to_string(y) + "-01-04");
  int monday = jan4 + 1 - weekday(jan4);
  char out[32];
  std::snprintf(out, sizeof(out), "%04d-W%02d", y, 1 + (d - monday) / 7);
  return out;
}
bool inScope(const Json &scope, int d) {
  if (scope.contains("start") && d < day(scope["start"]))
    return false;
  if (scope.contains("end") && d > day(scope["end"]))
    return false;
  if (scope.contains("weekdays")) {
    auto w = scope["weekdays"];
    if (std::find(w.begin(), w.end(), weekday(d)) == w.end())
      return false;
  }
  if (scope.contains("excludedDates")) {
    auto a = scope["excludedDates"];
    if (std::find(a.begin(), a.end(), date(d)) != a.end())
      return false;
  }
  return true;
}
bool applies(const Json &item, int d) {
  return inScope(item.value("scope", Json::object()), d) &&
         inScope(item.value("_policyScope", Json::object()), d);
}
Scenario::Scenario(Json j) : source(std::move(j)) {
  for (auto &e : source["employees"])
    employees.push_back({e["id"], e["label"], e["typeId"], e["attributes"]});
  for (auto &s : source["shifts"])
    shifts.push_back({s["id"], s["label"], s["kind"], s["intervals"]});
  for (auto &g : source["groups"])
    groups[g["id"]] = g["selector"];
  int first = day(source["calendar"]["start"]),
      last = day(source["calendar"]["end"]);
  if (last < first || last - first > 365)
    throw Error("HORIZON_LIMIT", "/calendar",
                "Horizon must contain 1–366 days");
  for (int d = first; d <= last; ++d)
    days.push_back(d);
  for (auto p : source["policies"])
    if (p["active"]) {
      p["objective"]["_policyScope"] = p.value("scope", Json::object());
      activePolicies.push_back(p);
    }
  std::sort(activePolicies.begin(), activePolicies.end(),
            [](const Json &a, const Json &b) {
              int pa = a["objective"]["priority"],
                  pb = b["objective"]["priority"];
              return pa == pb ? a["id"].get<std::string>() <
                                    b["id"].get<std::string>()
                              : pa < pb;
            });
}
std::vector<int> Scenario::select(const Json &s,
                                  std::set<std::string> visiting) const {
  std::set<int> groupMembers;
  if (s.contains("groupIds"))
    for (auto &g : s["groupIds"]) {
      std::string id = g;
      if (!groups.contains(id))
        throw Error("REFERENCE", "/selector/groupIds", "Unknown group: " + id);
      if (!visiting.insert(id).second)
        throw Error("GROUP_CYCLE", "/groups", "Cyclic group: " + id);
      auto members = select(groups.at(id), visiting);
      groupMembers.insert(members.begin(), members.end());
      visiting.erase(id);
    }
  std::vector<int> out;
  for (size_t i = 0; i < employees.size(); ++i) {
    auto &e = employees[i];
    bool yes = true;
    if (s.contains("employeeIds"))
      yes &= std::find(s["employeeIds"].begin(), s["employeeIds"].end(),
                       e.id) != s["employeeIds"].end();
    if (s.contains("typeIds"))
      yes &= std::find(s["typeIds"].begin(), s["typeIds"].end(), e.typeId) !=
             s["typeIds"].end();
    if (s.contains("groupIds"))
      yes &= groupMembers.contains(int(i));
    if (s.contains("attributes"))
      for (auto it = s["attributes"].begin(); it != s["attributes"].end(); ++it)
        yes &= e.attributes.contains(it.key()) &&
               e.attributes[it.key()] == it.value();
    if (yes)
      out.push_back(int(i));
  }
  return out;
}
bool Scenario::excluded(int d) const {
  auto &c = source["calendar"];
  for (auto &x : c["excludedDates"])
    if (day(x) == d)
      return true;
  for (auto &r : c["excludedRanges"])
    if (d >= day(r["start"]) && d <= day(r["end"]))
      return true;
  for (auto &w : c["excludedIsoWeeks"])
    if (w == isoWeek(d))
      return true;
  return false;
}
bool Scenario::absent(int e, int d) const {
  for (auto &a : source["availability"])
    if (applies(a, d)) {
      auto members = select(a["selector"]);
      if (std::find(members.begin(), members.end(), e) != members.end())
        return true;
    }
  for (auto &a : source["hrState"]["events"])
    if (a["employeeId"] == employees.at(e).id && a["operation"] == "UPSERT" &&
        a["status"] == "APPROVED" && d >= day(a["start"]) && d <= day(a["end"]))
      return true;
  return false;
}
std::vector<int> Scenario::allowed(int e, int d) const {
  if (excluded(d) || absent(e, d))
    return {};
  std::vector<int> out;
  for (size_t s = 0; s < shifts.size(); ++s) {
    bool yes = true;
    for (auto &r : source["allowedShifts"])
      if (applies(r, d)) {
        auto members = select(r["selector"]);
        if (std::find(members.begin(), members.end(), e) != members.end())
          yes &= std::find(r["shiftIds"].begin(), r["shiftIds"].end(),
                           shifts[s].id) != r["shiftIds"].end();
      }
    for (auto &i : shifts[s].intervals)
      if (i["endDayOffset"] == 1 && i["end"] != "00:00" &&
          (excluded(d + 1) || absent(e, d + 1)))
        yes = false;
    if (yes)
      out.push_back(int(s));
  }
  return out;
}
std::vector<Json> Scenario::constraints() const {
  std::vector<Json> out;
  for (auto &c : source["constraints"])
    if (std::find(source["baseConstraintIds"].begin(),
                  source["baseConstraintIds"].end(),
                  c["id"]) != source["baseConstraintIds"].end())
      out.push_back(c);
  for (auto &p : activePolicies) {
    std::set<std::string> references;
    for (auto &id : p["sharedConstraintIds"])
      references.insert(id);
    for (auto &setid : p["constraintSetIds"])
      for (auto &set : source["constraintSets"])
        if (set["id"] == setid)
          for (auto &id : set["constraintIds"])
            references.insert(id);
    for (auto &c : source["constraints"])
      if (references.contains(c["id"].get<std::string>())) {
        auto copy = c;
        copy["_policyScope"] = p.value("scope", Json::object());
        out.push_back(copy);
      }
    for (auto c : p["constraints"]) {
      c["_policyScope"] = p.value("scope", Json::object());
      out.push_back(c);
    }
  }
  return out;
}
Json response(const std::string &s) {
  return {{"format", "rostercore.result"},
          {"schemaVersion", 1},
          {"status", s},
          {"diagnostics", Json::array()}};
}
Json failure(const Error &e) {
  auto r = response("VALIDATION_ERROR");
  r["diagnostics"].push_back(
      {{"code", e.code}, {"path", e.path}, {"message", e.what()}});
  return r;
}
} // namespace rostercore
