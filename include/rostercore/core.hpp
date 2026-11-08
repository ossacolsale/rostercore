#pragma once
#include <cstdint>
#include <map>
#include <nlohmann/json.hpp>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
namespace rostercore {
using Json = nlohmann::json;
inline constexpr auto version = "0.1.0";
struct Error : std::runtime_error {
  std::string code, path;
  Error(std::string c, std::string p, std::string m)
      : std::runtime_error(std::move(m)), code(std::move(c)),
        path(std::move(p)) {}
};
struct Rational {
  int64_t n = 0, d = 1;
  Rational(int64_t numerator = 0, int64_t denominator = 1);
  Rational operator+(const Rational &) const;
  Rational operator-(const Rational &) const;
  Json json() const;
};
int64_t checked(int64_t a, int64_t b, bool multiply = false);
int64_t lcm(int64_t a, int64_t b);
std::string sha256(const std::string &);
int day(const std::string &);
std::string date(int);
int weekday(int);
std::string isoWeek(int);
bool inScope(const Json &, int);
bool applies(const Json &, int);
struct Employee {
  std::string id, label, typeId;
  Json attributes;
};
struct Shift {
  std::string id, label, kind;
  Json intervals;
};
struct Scenario {
  Json source;
  std::vector<Employee> employees;
  std::vector<Shift> shifts;
  std::vector<int> days;
  std::map<std::string, Json> groups;
  std::vector<Json> activePolicies;
  explicit Scenario(Json);
  std::vector<int> select(const Json &,
                          std::set<std::string> visiting = {}) const;
  bool excluded(int) const;
  bool absent(int employee, int date) const;
  std::vector<int> allowed(int employee, int date) const;
  std::vector<Json> constraints() const;
};
Json response(const std::string &status);
Json failure(const Error &);
void validateSchema(const Json &, const std::string &);
void validate(const Json &);
Json solve(const Json &);
Json verify(const Json &, const Json &);
bool evaluate(const Scenario &, const Json &, int,
              const std::map<std::pair<int, int>, int> &);
Json consolidate(const Json &, const Json &, const std::string &);
Json rebuildHistory(const Json &, const Json &, bool dryRun);
Json importPolicy(const Json &, const Json &, bool dryRun,
                  const Json &mappings = Json::object());
Json syncHR(const Json &, const Json &, bool dryRun);
Json aiContext(const Json &);
std::string objectiveFingerprint(const Json &);
std::map<int, int64_t> participants(const Scenario &, const Json &, int);
struct Ledger {
  std::map<int, Rational> ideal;
  std::map<int, int64_t> actual;
};
Ledger historicalLedger(const Scenario &, const Json &);
bool targetShift(const Scenario &, const Json &, int);
struct FairnessData {
  Json report;
  Json snapshots;
};
FairnessData fairness(const Scenario &, const Json &assignments);
} // namespace rostercore
