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
inline constexpr auto version = "0.4.0";
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
  std::map<int, std::string> selectedWeeks;
  explicit Scenario(Json);
  std::vector<int> select(const Json &, int onDate = -1,
                          std::set<std::string> visiting = {},
                          const std::string &profileId = "") const;
  Json weekOptions(int) const;
  std::vector<int> weeks() const;
  std::string profile(int) const;
  Json profileDefinition(const std::string &) const;
  Json holiday(int) const;
  bool matches(const Json &, int, const std::string &profileId = "") const;
  bool active(int, int) const;
  bool closed(int, int) const;
  bool plannable(int, int) const;
  bool operational(int) const;
  Json employeeState(int, int) const;
  Json workPatternAssignment(int, int, const std::string &profileId = "") const;
  Json resolvedAttributes(int, int) const;
  Json intervals(int, int, int, const std::string &profileId = "") const;
  std::vector<int> domain(int, int, const std::string &profileId = "") const;
  std::vector<Json> duties() const;
  std::vector<Json> transitions() const;
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
Json improve(const Json &, const Json &);
Json migrate(const Json &);
Json inspect(const Json &, const std::string &);
Json previewWorkPatterns(const Json &, const std::string &);
Json configurationDiagnostics(const Json &);
Json regenerate(const Json &, const Json &);
Json importScenario(const Json &, const Json &, bool dryRun);
Json applyChangeSet(const Json &, const Json &, bool dryRun);
Json archiveOperation(const Json &, const Json &);
std::string integrityHash(const Json &);
std::string configurationHash(const Json &);
void validateEvolution(const Json &, bool workforceOnly = false);
int isoMonday(int);
bool effective(const Json &, int);
const Json &catalogues();
int64_t instant(const std::string &, int, int, int fold = -1);
std::vector<std::pair<int64_t, int64_t>>
spans(const Scenario &, int, int, int, const std::string &profileId = "");
bool temporalCompatible(const Scenario &, int, int, int, int, int,
                        const std::string & = "", const std::string & = "");
struct CoverageCandidate {
  int employee, date, shift, level;
  std::string profileId;
  std::vector<std::pair<int64_t, int64_t>> intervals;
};
std::vector<CoverageCandidate>
coverageCandidates(const Scenario &, const Json &, int, const std::string &);
std::vector<std::pair<int64_t, int64_t>> requirementSpans(const Scenario &,
                                                          const Json &, int);
std::vector<int> fairnessMembers(const Scenario &, const Json &);
Json verify(const Json &, const Json &);
Json verifyQuality(const Json &, const Json &, double budget = 15);
struct SpacingPair {
  int employee, first, second;
  std::string profile;
};
std::vector<SpacingPair> spacingPairs(const Scenario &, const Json &);
Json knownAssignments(const Scenario &);
Json workloadReport(const Scenario &, const Json &);
Json fallbackAccounting(const Scenario &, const Json &);
void resolveResultWeeks(Scenario &, const Json &);
Json verifyEvolution(const Scenario &, const Json &);
Json scheduleCoverage(const Scenario &, const Json &,
                      const Json &choices = Json::array());
bool evaluate(const Scenario &, const Json &, int,
              const std::map<std::pair<int, int>, int> &);
Json consolidate(const Json &, const Json &, const std::string &);
Json rebuildHistory(const Json &, const Json &, bool dryRun);
Json importPolicy(const Json &, const Json &, bool dryRun,
                  const Json &mappings = Json::object());
Json syncHR(const Json &, const Json &, bool dryRun);
Json aiContext(const Json &);
std::string objectiveFingerprint(const Json &);
std::map<int, int64_t> participants(const Scenario &, const Json &, int,
                                    const std::string &profileId = "");
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
