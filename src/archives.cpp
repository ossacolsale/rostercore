#include "rostercore/core.hpp"
#include <algorithm>
#include <cmath>
#include <sstream>
namespace rostercore {
namespace {
Json portableNumbers(const Json &value) {
  if (value.is_array()) {
    Json result = Json::array();
    for (auto &x : value)
      result.push_back(portableNumbers(x));
    return result;
  }
  if (value.is_object()) {
    Json result = Json::object();
    for (auto it = value.begin(); it != value.end(); ++it)
      result[it.key()] = portableNumbers(it.value());
    return result;
  }
  if (value.is_number_float()) {
    double number = value.get<double>();
    if (std::isfinite(number) && std::trunc(number) == number &&
        std::abs(number) <= 9007199254740991.0)
      return Json(static_cast<int64_t>(number));
  }
  if (value.is_number_integer()) {
    long double number = value.get<long double>();
    if (std::abs(number) > 9007199254740991.0L)
      throw Error("NUMERIC_LIMIT", "/",
                  "Portable archives require exact JSON integers within the "
                  "JavaScript safe-integer range");
  }
  return value;
}
} // namespace
std::string integrityHash(const Json &document) {
  auto copy = portableNumbers(document);
  copy.erase("integrityHash");
  return sha256(copy.dump());
}
std::string configurationHash(const Json &scenario) {
  return scenario.value("schemaVersion", 1) >= 4 ? integrityHash(scenario)
                                                 : sha256(scenario.dump());
}
namespace {
std::string cell(const Json &a) {
  return a["employeeId"].get<std::string>() + ":" +
         a["date"].get<std::string>();
}
void seal(Json &a) { a["integrityHash"] = integrityHash(a); }
void ensure(bool ok, const std::string &code, const std::string &message) {
  if (!ok)
    throw Error(code, "/archives", message);
}
Json originalScenario(const Json &a) {
  auto original = Json::parse(a["scenarioEncoding"].get<std::string>());
  ensure(portableNumbers(original) == portableNumbers(a["scenario"]),
         "ARCHIVE_CONTEXT",
         "Original context encoding differs from its readable scenario");
  return original;
}
void checkArchive(const Json &a) {
  validateSchema(a, "schedule-archive");
  ensure(a["integrityHash"] == integrityHash(a), "ARCHIVE_INTEGRITY",
         "Archive integrity hash does not match its canonical content");
  auto s = originalScenario(a);
  auto &r = a["result"];
  validate(s);
  ensure(a["scenarioId"] == s["id"] && a["scenarioRevision"] == s["revision"],
         "ARCHIVE_IDENTITY",
         "Archive scenario identity/revision differs from its context");
  ensure(
      a["configurationHash"] == configurationHash(s) &&
          r.value("metadata", Json::object()).value("configurationHash", "") ==
              a["configurationHash"].get<std::string>(),
      "CONFIGURATION_MISMATCH",
      "Archive result does not belong to its original scenario");
  ensure(a["period"]["start"] == s["calendar"]["start"] &&
             a["period"]["end"] == s["calendar"]["end"],
         "ARCHIVE_PERIOD", "Archive period differs from its scenario");
  ensure(a["engineVersion"] == r["metadata"]["engineVersion"] &&
             a["solverVersion"] == r["metadata"]["backendVersion"],
         "ARCHIVE_VERSION",
         "Archive engine/backend metadata differs from its result");
  ensure(!a.contains("supersedesId") || a["supersedesId"] != a["id"],
         "ARCHIVE_REVISION", "A revision cannot supersede itself");
  ensure(r["status"] == "OPTIMAL" || r["status"] == "FEASIBLE",
         "ARCHIVE_INVALID",
         "Archive creation requires a feasible or optimal scheduling result");
  auto verified = verify(s, r);
  ensure(verified["status"] == "VERIFIED", "ARCHIVE_INVALID",
         "Archived schedule fails independent verification: " +
             verified["diagnostics"].dump());
  ensure(a["state"] != "COMPLETED" || a.contains("completedThrough"),
         "ARCHIVE_STATE",
         "Completed archives require an explicitly confirmed prefix");
  if (a.contains("completedThrough"))
    ensure(day(a["completedThrough"]) >= day(a["period"]["start"]) &&
               day(a["completedThrough"]) <= day(a["period"]["end"]),
           "ARCHIVE_PERIOD", "Completed prefix is outside the archived period");
  std::map<std::string, Json> assignments;
  for (auto &x : r["assignments"])
    assignments[cell(x)] = x;
  for (auto &x : a["publishedLocks"])
    ensure(assignments.contains(cell(x)) && assignments.at(cell(x)) == x,
           "ARCHIVE_LOCK",
           "Published lock differs from the archived assignment");
}
std::string immutableHash(const Json &a) {
  return integrityHash(Json{{"id", a["id"]},
                            {"scenarioEncoding", a["scenarioEncoding"]},
                            {"result", a["result"]},
                            {"period", a["period"]}});
}
void transition(Json &a, const std::string &state, const std::string &at) {
  if (a["state"] != state) {
    a["state"] = state;
    a["revision"] = a["revision"].get<int>() + 1;
    a["events"].push_back({{"state", state}, {"at", at}});
  }
  seal(a);
}
void archiveState(Json &s) {
  s["schemaVersion"] = 4;
  if (!s.contains("archiveState"))
    s["archiveState"] = {{"publishedIds", Json::array()},
                         {"completedIds", Json::array()}};
}
bool has(const Json &ids, const Json &id) {
  return std::find(ids.begin(), ids.end(), id) != ids.end();
}
void add(Json &ids, const Json &id) {
  if (!has(ids, id))
    ids.push_back(id);
}
void remove(Json &ids, const Json &id) {
  Json next = Json::array();
  for (auto &x : ids)
    if (x != id)
      next.push_back(x);
  ids = next;
}
void identities(const Json &s, const Json &a) {
  ensure(s["id"] == a["scenarioId"], "ARCHIVE_SCENARIO",
         "Archive belongs to another scenario; explicitly restore its context "
         "or a workspace backup");
  std::set<std::string> employees, shifts;
  for (auto &e : s["employees"])
    employees.insert(e["id"]);
  for (auto &t : s["shifts"])
    shifts.insert(t["id"]);
  for (auto &x : a["result"]["assignments"])
    ensure(employees.contains(x["employeeId"]) && shifts.contains(x["shiftId"]),
           "ARCHIVE_REFERENCE",
           "Missing stable employee/shift identifier; restore the archived "
           "context or perform an explicit migration");
}
void publish(Json &s, Json &a, Json &catalogue, const std::string &at) {
  identities(s, a);
  ensure(a["state"] != "SUPERSEDED", "ARCHIVE_STATE",
         "A superseded revision cannot be published again");
  archiveState(s);
  if (has(s["archiveState"]["publishedIds"], a["id"]) &&
      a["state"] != "SUPERSEDED") {
    bool intact = true;
    for (auto &x : a["publishedLocks"])
      if (day(x["date"]) >= day(s["calendar"]["start"])) {
        bool present = false;
        for (auto &lock : s["publishedAssignments"])
          present |= lock == x;
        intact &= present;
      }
    if (intact) {
      seal(a);
      return;
    }
  }
  if (a.contains("supersedesId")) {
    bool found = false;
    for (auto &old : catalogue)
      if (old["id"] == a["supersedesId"]) {
        ensure(old["state"] != "SUPERSEDED" &&
                   has(s["archiveState"]["publishedIds"], old["id"]),
               "ARCHIVE_REVISION",
               "Revise the currently active publication, not a stale or "
               "reference revision");
        found = true;
        std::set<std::string> keys;
        for (auto &x : old["publishedLocks"])
          keys.insert(cell(x));
        Json kept = Json::array();
        for (auto &x : s["publishedAssignments"])
          if (!keys.contains(cell(x)) ||
              day(x["date"]) < day(s["calendar"]["start"]))
            kept.push_back(x);
        s["publishedAssignments"] = kept;
        transition(old, "SUPERSEDED", at);
        remove(s["archiveState"]["publishedIds"], old["id"]);
      }
    ensure(found, "ARCHIVE_REVISION", "The superseded archive is missing");
  }
  std::map<std::string, Json> locks;
  for (auto &x : s["publishedAssignments"])
    locks[cell(x)] = x;
  for (auto &x : a["result"]["assignments"])
    if (day(x["date"]) >= day(s["calendar"]["start"])) {
      auto key = cell(x);
      ensure(!locks.contains(key) || locks.at(key) == x, "ARCHIVE_OVERLAP",
             "Publication conflicts with an official locked assignment; create "
             "an explicit revision");
      locks[key] = x;
    }
  s["publishedAssignments"] = Json::array();
  for (auto &[key, value] : locks) {
    (void)key;
    s["publishedAssignments"].push_back(value);
  }
  a["publishedLocks"] = a["result"]["assignments"];
  add(s["archiveState"]["publishedIds"], a["id"]);
  s.erase("proposal");
  validate(s);
  int first = std::max(day(s["calendar"]["start"]), day(a["period"]["start"])),
      last = std::min(day(s["calendar"]["end"]), day(a["period"]["end"]));
  if (first <= last) {
    Json probe = s, r = a["result"];
    probe["calendar"]["start"] = date(first);
    probe["calendar"]["end"] = date(last);
    r.erase("fairness");
    r.erase("quality");
    r.erase("workload");
    for (auto key :
         {"assignments", "coverage", "calendarStates", "calendarDays"})
      if (r.contains(key)) {
        Json keep = Json::array();
        for (auto &row : r[key])
          if (day(row["date"]) >= first && day(row["date"]) <= last)
            keep.push_back(row);
        r[key] = keep;
      }
    if (r.contains("weekAssignments")) {
      Json weeks = Json::array();
      for (auto row : r["weekAssignments"])
        if (isoMonday(day(row["week"])) >= isoMonday(first) &&
            isoMonday(day(row["week"])) <= isoMonday(last)) {
          row.erase("origin");
          weeks.push_back(row);
        }
      r["weekAssignments"] = weeks;
    }
    auto checked = verify(probe, r);
    ensure(checked["status"] == "VERIFIED", "ARCHIVE_CURRENT_CONFLICT",
           "Archived assignments are incompatible with the current "
           "workforce/calendar: " +
               checked["diagnostics"].dump());
  }
  transition(a, a.contains("completedThrough") ? "COMPLETED" : "PUBLISHED", at);
  seal(a);
}
void complete(Json &s, Json &a, const std::string &through,
              const std::string &at) {
  identities(s, a);
  ensure(a["state"] != "SUPERSEDED", "ARCHIVE_STATE",
         "Complete the active revision, not a superseded plan");
  ensure(!a.contains("completedThrough") ||
             day(through) >= day(a["completedThrough"]),
         "ARCHIVE_COMPLETION", "Completed history cannot be moved backwards");
  auto replay = consolidate(originalScenario(a), a["result"], through);
  ensure(replay["status"] == "CONSOLIDATED", "ARCHIVE_COMPLETION",
         "Cannot independently replay the completed prefix");
  auto incoming = replay["scenario"]["history"];
  for (auto &actual : incoming["assignments"])
    for (auto &official : s["publishedAssignments"])
      if (cell(actual) == cell(official))
        ensure(actual == official, "ARCHIVE_OVERLAP",
               "Completed work conflicts with a protected official assignment; "
               "reconcile the publication through an explicit revision first");
  std::map<std::string, Json> cells;
  for (auto &x : s["history"]["assignments"])
    cells[cell(x)] = x;
  for (auto &x : incoming["assignments"]) {
    auto key = cell(x);
    ensure(
        !cells.contains(key) || cells.at(key) == x, "ARCHIVE_HISTORY_CONFLICT",
        "Imported completed work conflicts with existing actual assignments");
    cells[key] = x;
  }
  s["history"]["assignments"] = Json::array();
  for (auto &[key, value] : cells) {
    (void)key;
    s["history"]["assignments"].push_back(value);
  }
  std::map<std::string, Json> snapshots;
  for (auto &x : s["history"]["fairnessSnapshots"])
    snapshots[x["objectiveId"].get<std::string>() + ":" +
              x["date"].get<std::string>()] = x;
  for (auto &x : incoming["fairnessSnapshots"]) {
    auto key = x["objectiveId"].get<std::string>() + ":" +
               x["date"].get<std::string>();
    ensure(!snapshots.contains(key) || snapshots.at(key) == x,
           "HISTORY_REBUILD_REQUIRED",
           "Participation snapshots differ; rebuild explicitly from original "
           "dated contexts");
    snapshots[key] = x;
  }
  s["history"]["fairnessSnapshots"] = Json::array();
  for (auto &[key, value] : snapshots) {
    (void)key;
    s["history"]["fairnessSnapshots"].push_back(value);
  }
  int stop = std::max(day(through), s["history"].contains("through")
                                        ? day(s["history"]["through"])
                                        : day(through));
  s["history"]["through"] = date(stop);
  s["calendar"]["start"] =
      date(std::max(day(s["calendar"]["start"]), stop + 1));
  if (day(s["calendar"]["end"]) < day(s["calendar"]["start"]))
    s["calendar"]["end"] = s["calendar"]["start"];
  if (replay["scenario"].contains("weekConfiguration")) {
    if (!s.contains("weekConfiguration"))
      s["weekConfiguration"] = {{"manual", Json::array()},
                                {"recurrences", Json::array()},
                                {"frequencies", Json::array()},
                                {"history", Json::array()}};
    auto &weeks = s["weekConfiguration"]["history"];
    for (auto &w : replay["scenario"]["weekConfiguration"]["history"]) {
      bool found = false;
      for (auto &old : weeks)
        if (isoMonday(day(old["week"])) == isoMonday(day(w["week"]))) {
          ensure(old["profileId"] == w["profileId"], "ARCHIVE_HISTORY_CONFLICT",
                 "Consolidated week choices conflict");
          found = true;
        }
      if (!found)
        weeks.push_back(w);
    }
  }
  Json locks = Json::array();
  for (auto &x : s["publishedAssignments"])
    if (day(x["date"]) > stop)
      locks.push_back(x);
  s["publishedAssignments"] = locks;
  archiveState(s);
  add(s["archiveState"]["completedIds"], a["id"]);
  if (stop >= day(a["period"]["end"]))
    remove(s["archiveState"]["publishedIds"], a["id"]);
  bool advancing = a.contains("completedThrough") &&
                   day(through) > day(a["completedThrough"]);
  bool wasCompleted = a["state"] == "COMPLETED";
  a["completedThrough"] = through;
  if (advancing && wasCompleted) {
    a["revision"] = a["revision"].get<int>() + 1;
    a["events"].push_back(
        {{"state", "COMPLETED"}, {"at", at}, {"completedThrough", through}});
  }
  transition(a, "COMPLETED", at);
  if (!wasCompleted)
    a["events"].back()["completedThrough"] = through;
  seal(a);
  validate(s);
  Scenario check(s);
  for (auto &p : check.activePolicies)
    historicalLedger(check, p["objective"]);
}
std::string quoted(std::string text) {
  if (!text.empty() &&
      (text[0] == '=' || text[0] == '+' || text[0] == '-' || text[0] == '@'))
    text = "'" + text;
  std::string out = "\"";
  for (char c : text) {
    out += c;
    if (c == '\"')
      out += '\"';
  }
  return out + "\"";
}
std::string csv(const Json &a) {
  std::map<std::string, std::string> names, shifts;
  for (auto &e : a["scenario"]["employees"])
    names[e["id"]] = e["label"];
  for (auto &s : a["scenario"]["shifts"])
    shifts[s["id"]] = s["label"];
  std::ostringstream out;
  out << "Date,Employee ID,Employee,Shift ID,Shift,Actual intervals,Week "
         "profile\r\n";
  for (auto &x : a["result"]["assignments"])
    out << quoted(x["date"]) << ',' << quoted(x["employeeId"]) << ','
        << quoted(names[x["employeeId"]]) << ',' << quoted(x["shiftId"]) << ','
        << quoted(shifts[x["shiftId"]]) << ','
        << quoted(x.value("intervals", Json::array()).dump()) << ','
        << quoted(x.value("weekProfileId", "")) << "\r\n";
  return out.str();
}
} // namespace
Json archiveOperation(const Json &scenario, const Json &request) {
  validate(scenario);
  validateSchema(request, "archive-request");
  Json current = scenario, catalogue = request["archives"];
  std::set<std::string> ids;
  for (auto &a : catalogue) {
    checkArchive(a);
    ensure(ids.insert(a["id"]).second, "ARCHIVE_IDENTITY",
           "Duplicate archive IDs in the workspace");
  }
  const std::string operation = request["operation"],
                    at = request.value("at", "unspecified");
  bool dry = request["dryRun"];
  bool read =
      operation == "OPEN" || operation == "CSV" || operation == "BACKUP";
  if (!read)
    ensure(request.contains("expectedRevision") &&
               request["expectedRevision"] == scenario["revision"],
           "REVISION_CONFLICT",
           "The scenario changed after this archive operation was prepared");
  auto find = [&](const Json &id) -> Json & {
    for (auto &a : catalogue)
      if (a["id"] == id)
        return a;
    throw Error("ARCHIVE_REFERENCE", "/archives",
                "Unknown archive ID: " + id.get<std::string>());
  };
  auto out = response(dry ? "PREVIEW" : "IMPORTED");
  Json overlap = Json::array();
  if (operation == "CREATE") {
    Json a = {
        {"format", "rostercore.schedule-archive"},
        {"schemaVersion", 1},
        {"id", request["id"]},
        {"revision", 1},
        {"scenarioId", scenario["id"]},
        {"scenarioRevision", scenario["revision"]},
        {"configurationHash", configurationHash(scenario)},
        {"engineVersion", request["result"]["metadata"]["engineVersion"]},
        {"solverVersion", request["result"]["metadata"]["backendVersion"]},
        {"period",
         {{"start", scenario["calendar"]["start"]},
          {"end", scenario["calendar"]["end"]}}},
        {"state", "DRAFT"},
        {"createdAt", request["createdAt"]},
        {"source", request["source"]},
        {"scenario", scenario},
        {"scenarioEncoding", scenario.dump()},
        {"result", request["result"]},
        {"publishedLocks", Json::array()},
        {"events",
         Json::array({{{"state", "DRAFT"}, {"at", request["createdAt"]}}})}};
    if (request.contains("supersedesId"))
      a["supersedesId"] = request["supersedesId"];
    else if (scenario.contains("proposal"))
      a["supersedesId"] = scenario["proposal"]["supersedesId"];
    seal(a);
    checkArchive(a);
    ensure(!ids.contains(a["id"]), "ARCHIVE_IDENTITY",
           "Choose a new ID for every generated revision");
    catalogue.push_back(a);
    out["archive"] = a;
    if (!dry)
      out["status"] = "ARCHIVED";
  } else if (operation == "IMPORT") {
    Json incoming = request["archive"];
    checkArchive(incoming);
    const std::string mode = request["mode"];
    if (mode == "RESTORE_CONTEXT")
      current = originalScenario(incoming);
    else
      identities(current, incoming);
    for (auto &a : catalogue)
      if (a["id"] != incoming["id"] &&
          a["scenarioId"] == incoming["scenarioId"] &&
          day(a["period"]["start"]) <= day(incoming["period"]["end"]) &&
          day(incoming["period"]["start"]) <= day(a["period"]["end"]))
        overlap.push_back({{"id", a["id"]}, {"state", a["state"]}});
    if (ids.contains(incoming["id"])) {
      auto &old = find(incoming["id"]);
      ensure(immutableHash(old) == immutableHash(incoming), "ARCHIVE_IDENTITY",
             "This archive ID already identifies different immutable content");
    } else
      catalogue.push_back(incoming);
    auto &a = find(incoming["id"]);
    if (mode == "PUBLISH")
      publish(current, a, catalogue, at);
    else if (mode == "COMPLETE") {
      ensure(incoming.contains("completedThrough"), "ARCHIVE_COMPLETION",
             "Only an explicitly completed prefix can be imported into actual "
             "history");
      complete(current, a, incoming["completedThrough"], at);
    }
    out["archive"] = a;
  } else if (operation == "PUBLISH") {
    auto &a = find(request["id"]);
    publish(current, a, catalogue, at);
    out["archive"] = a;
    if (!dry)
      out["status"] = "PUBLISHED";
  } else if (operation == "COMPLETE") {
    auto &a = find(request["id"]);
    complete(current, a, request["through"], at);
    out["archive"] = a;
    if (!dry)
      out["status"] = "CONSOLIDATED";
  } else if (operation == "REBUILD_HISTORY") {
    Json contexts = {{"format", "rostercore.history-contexts"},
                     {"schemaVersion", 1},
                     {"scenarios", Json::array()}};
    std::set<std::string> dates;
    for (auto &actual : current["history"]["assignments"])
      dates.insert(actual["date"]);
    for (auto &atDate : dates) {
      const Json *found = nullptr;
      for (auto &a : catalogue)
        if (a["scenarioId"] == current["id"] &&
            a.contains("completedThrough") &&
            a["period"]["start"].get<std::string>() <= atDate &&
            a["completedThrough"].get<std::string>() >= atDate) {
          bool same = true;
          for (auto &actual : current["history"]["assignments"])
            if (actual["date"] == atDate) {
              bool match = false;
              for (auto &row : a["result"]["assignments"])
                match |= row == actual;
              same &= match;
            }
          if (same) {
            found = &a;
            break;
          }
        }
      ensure(found != nullptr, "ARCHIVE_CONTEXT_REQUIRED",
             "No completed archive supplies the original eligibility context "
             "for " +
                 atDate +
                 ". Import original historical contexts explicitly; no quota "
                 "weights were guessed.");
      auto context = originalScenario(*found);
      context["calendar"]["start"] = atDate;
      context["calendar"]["end"] = atDate;
      context["history"] = {{"assignments", Json::array()},
                            {"fairnessSnapshots", Json::array()}};
      context["publishedAssignments"] = Json::array();
      context.erase("replanning");
      context.erase("proposal");
      // Explicit reconstruction uses today's category membership over actual
      // historical shifts, while retaining the archived workforce, hours,
      // availability and weekly context.
      for (auto &shift : context["shifts"])
        for (auto &now : current["shifts"])
          if (shift["id"] == now["id"])
            shift["fairnessTags"] = now.value("fairnessTags", Json::array());
      context["schemaVersion"] = 4;
      contexts["scenarios"].push_back(context);
    }
    auto rebuilt = rebuildHistory(current, contexts, false);
    ensure(rebuilt.contains("scenario"), "ARCHIVE_CONTEXT_REQUIRED",
           "Historical reconstruction failed: " + rebuilt.dump());
    auto candidate = rebuilt["scenario"];
    candidate["revision"] = current["revision"];
    current = candidate;
    out["preview"]["historyRebuilt"] = true;
  } else if (operation == "REVISE") {
    auto &a = find(request["id"]);
    identities(current, a);
    ensure(a["state"] == "PUBLISHED" || a["state"] == "COMPLETED",
           "ARCHIVE_STATE", "Create a revision from an official calendar");
    int from = day(request["from"]);
    ensure(from >= day(current["calendar"]["start"]) &&
               from <= day(a["period"]["end"]),
           "ARCHIVE_PERIOD",
           "A proposal can change only unconsolidated future dates");
    std::set<std::string> keys;
    for (auto &x : a["publishedLocks"])
      if (day(x["date"]) >= from)
        keys.insert(cell(x));
    Json kept = Json::array();
    for (auto &x : current["publishedAssignments"])
      if (!keys.contains(cell(x)))
        kept.push_back(x);
    current["publishedAssignments"] = kept;
    current["schemaVersion"] = 4;
    current["proposal"] = {{"supersedesId", a["id"]},
                           {"from", request["from"]}};
  } else if (operation == "OPEN") {
    auto &a = find(request["id"]);
    out["status"] = "OPENED";
    out["restoredSchedule"] = {{"scenario", originalScenario(a)},
                               {"result", a["result"]},
                               {"archiveId", a["id"]},
                               {"scenarioEncoding", a["scenarioEncoding"]}};
  } else if (operation == "CSV") {
    out["status"] = "EXPORTED";
    out["csv"] = csv(find(request["id"]));
  } else if (operation == "BACKUP") {
    Json backup = {{"format", "rostercore.workspace-backup"},
                   {"schemaVersion", 1},
                   {"scenario", scenario},
                   {"archives", catalogue},
                   {"createdAt", request["createdAt"]}};
    seal(backup);
    out["status"] = "EXPORTED";
    out["document"] = backup;
  } else if (operation == "RESTORE") {
    auto backup = request["backup"];
    validateSchema(backup, "workspace-backup");
    ensure(backup["integrityHash"] == integrityHash(backup),
           "ARCHIVE_INTEGRITY", "Workspace backup hash does not match");
    validate(backup["scenario"]);
    std::set<std::string> restoredIds;
    for (auto &a : backup["archives"]) {
      checkArchive(a);
      ensure(restoredIds.insert(a["id"]).second, "ARCHIVE_IDENTITY",
             "Backup contains duplicate archive IDs");
    }
    current = backup["scenario"];
    catalogue = backup["archives"];
    if (!dry)
      out["status"] = "RESTORED";
  }
  bool changed = current != scenario;
  if (changed && operation != "RESTORE")
    current["revision"] = scenario["revision"].get<int>() + 1;
  validate(current);
  bool rebuiltHistory = operation == "REBUILD_HISTORY";
  out["preview"] = {
      {"historyRebuilt", rebuiltHistory},
      {"operation", operation},
      {"overlappingCalendars", overlap},
      {"scenarioChanged", changed},
      {"beforeRevision", scenario["revision"]},
      {"afterRevision", current["revision"]},
      {"historyAssignmentsBefore", scenario["history"]["assignments"].size()},
      {"historyAssignmentsAfter", current["history"]["assignments"].size()},
      {"publishedLocksBefore", scenario["publishedAssignments"].size()},
      {"publishedLocksAfter", current["publishedAssignments"].size()},
      {"archiveCount", catalogue.size()}};
  if (dry) {
    out["preview"]["scenario"] = current;
    out["preview"]["archives"] = catalogue;
  } else if (!read) {
    out["archives"] = catalogue;
    if (changed)
      out["scenario"] = current;
  }
  return out;
}
} // namespace rostercore
