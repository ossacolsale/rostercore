#include "rostercore/core.hpp"
#include <algorithm>
#include <sstream>
namespace rostercore {
namespace {
bool has(const Json &ids, const Json &id) {
  return std::find(ids.begin(), ids.end(), id) != ids.end();
}
std::string key(const Json &a) {
  return a["employeeId"].get<std::string>() + ":" +
         a["date"].get<std::string>();
}
std::string uid(const Json &parts) {
  return sha256(parts.dump()) + "@rostercore.local";
}
int minutes(const Json &time) {
  auto s = time.get<std::string>();
  return std::stoi(s.substr(0, 2)) * 60 + std::stoi(s.substr(3, 2));
}
std::string quote(std::string s) {
  auto first = s.find_first_not_of(" \t\r\n");
  if (first != std::string::npos && (s[first] == '=' || s[first] == '+' ||
                                     s[first] == '-' || s[first] == '@'))
    s = "'" + s;
  std::string out = "\"";
  for (char c : s) {
    out += c;
    if (c == '"')
      out += '"';
  }
  return out + "\"";
}
} // namespace
Json calendarView(const Json &a, const Json &o) {
  validateSchema(o, "calendar-view-options");
  Scenario s(Json::parse(a["scenarioEncoding"].get<std::string>()));
  resolveResultWeeks(s, a["result"]);
  int first = day(o["start"]), last = day(o["end"]);
  if (first > last || first < day(a["period"]["start"]) ||
      last > day(a["period"]["end"]))
    throw Error("EXPORT_PERIOD", "/options",
                "Export dates must be inside the saved calendar period");
  auto &people = o["employeeSelection"];
  auto &shifts = o["shiftSelection"];
  auto check = [&](const Json &ids, const Json &items,
                   const std::string &field) {
    for (auto &id : ids) {
      bool found = false;
      for (auto &item : items)
        found |= item["id"] == id;
      if (!found)
        throw Error("REFERENCE", "/options/" + field,
                    "Unknown export reference: " + id.get<std::string>());
    }
  };
  check(people["employeeIds"], s.source["employees"], "employees");
  check(people["typeIds"], s.source["employeeTypes"], "types");
  check(people["groupIds"], s.source["groups"], "groups");
  check(shifts["shiftIds"], s.source["shifts"], "shifts");
  check(shifts["normalShiftIds"], s.source["shifts"], "normalShifts");
  if (shifts["hideNormal"].get<bool>() && shifts["normalShiftIds"].empty())
    throw Error(
        "EXPORT_NORMAL", "/options/shiftSelection",
        "Select which working shifts represent normal work before hiding them");
  for (auto &sh : s.source["shifts"])
    if (has(shifts["normalShiftIds"], sh["id"]) && sh["kind"] != "WORKING")
      throw Error("EXPORT_NORMAL", "/options/shiftSelection",
                  "Rest cannot be classified as normal working shifts");
  std::map<int, std::set<int>> selected;
  std::set<int> included;
  for (int d = first; d <= last; ++d) {
    auto &set = selected[d];
    if (people["all"].get<bool>())
      for (size_t e = 0; e < s.employees.size(); ++e)
        set.insert(int(e));
    else {
      for (size_t e = 0; e < s.employees.size(); ++e)
        if (has(people["employeeIds"], s.employees[e].id))
          set.insert(int(e));
      for (auto field : {"typeIds", "groupIds"})
        if (!people[field].empty())
          for (int e : s.select(Json{{field, people[field]}}, d))
            set.insert(e);
    }
    included.insert(set.begin(), set.end());
  }
  Json out = {{"format", "rostercore.calendar-view"},
              {"schemaVersion", 1},
              {"authoritative", false},
              {"scenarioLabel", s.source["label"]},
              {"period", {{"start", o["start"]}, {"end", o["end"]}}},
              {"sourcePeriod", a["period"]},
              {"timezone", s.source["calendar"]["timezone"]},
              {"state", a["state"]},
              {"scenarioRevision", a["scenarioRevision"]},
              {"revision", a["revision"]},
              {"createdAt", a["createdAt"]},
              {"lastModified",
               a["events"].empty() ? a["createdAt"] : a["events"].back()["at"]},
              {"searchStatus", a["result"]["status"]},
              {"preferencesUnproved", a["result"]["status"] != "OPTIMAL"},
              {"employees", Json::array()},
              {"days", Json::array()},
              {"cells", Json::array()},
              {"totalEmployees", s.employees.size()},
              {"options", o}};
  if (a.contains("completedThrough"))
    out["completedThrough"] = a["completedThrough"];
  for (auto &event : a["events"])
    if (event["state"] == "PUBLISHED") {
      out["publishedAt"] = event["at"];
      break;
    }
  bool futurePublished = false;
  for (auto &lock : a["publishedLocks"])
    if (!a.contains("completedThrough") ||
        lock["date"].get<std::string>() >
            a["completedThrough"].get<std::string>())
      futurePublished = true;
  out["futurePublished"] = futurePublished;
  for (int e : included)
    out["employees"].push_back(
        {{"id", s.employees[e].id}, {"label", s.employees[e].label}});
  std::map<std::string, Json> assignments, states, locks;
  for (auto &x : a["result"]["assignments"])
    assignments[key(x)] = x;
  for (auto &x : a["result"].value("calendarStates", Json::array()))
    states[key(x)] = x;
  for (auto &x : a["publishedLocks"])
    locks[key(x)] = x;
  for (int d = first; d <= last; ++d) {
    auto at = date(d), profile = s.profile(d);
    auto holidays =
        o["showClosuresAndHolidays"].get<bool>() ? s.holiday(d) : Json::array();
    out["days"].push_back(
        {{"date", at},
         {"profileId", profile},
         {"profileLabel", s.profileDefinition(profile).value("label", "")},
         {"holidays", holidays}});
    for (int e : included) {
      std::string id = s.employees[e].id, k = id + ":" + at;
      Json c = {
          {"employeeId", id},
          {"date", at},
          {"state", "UNPLANNED"},
          {"intervals", Json::array()},
          {"lifecycle", a["state"] == "SUPERSEDED" ? "SUPERSEDED"
                        : a.contains("completedThrough") &&
                                at <= a["completedThrough"].get<std::string>()
                            ? "COMPLETED"
                        : locks.contains(k) ? "PUBLISHED"
                                            : "DRAFT"}};
      if (!selected[d].contains(e))
        c["state"] = "FILTERED_PERSON";
      else if (states.contains(k)) {
        auto state = states[k]["state"].get<std::string>();
        c["state"] = state;
        if (state == "ABSENT") {
          if (!o["showAbsences"].get<bool>())
            c["state"] = "FILTERED_ABSENCE";
          else if (o["includeAbsenceReasons"].get<bool>()) {
            Json reasons = Json::array();
            for (auto &event : s.source["hrState"]["events"]) {
              if (event["operation"] != "UPSERT" ||
                  event["status"] != "APPROVED" || event["employeeId"] != id ||
                  day(event["start"]) > d || day(event["end"]) < d)
                continue;
              if (event.contains("absenceType") &&
                  !event["absenceType"].get<std::string>().empty() &&
                  !has(reasons, event["absenceType"]))
                reasons.push_back(event["absenceType"]);
            }
            if (!reasons.empty())
              c["absenceReasons"] = reasons;
          }
        } else if (state == "CLOSED" &&
                   !o["showClosuresAndHolidays"].get<bool>())
          c["state"] = "FILTERED_CLOSED";
      } else if (assignments.contains(k)) {
        auto &assignment = assignments[k];
        int t = 0;
        while (s.shifts.at(size_t(t)).id !=
               assignment["shiftId"].get<std::string>())
          ++t;
        auto &sh = s.shifts[size_t(t)];
        bool rest = sh.kind == "OFF";
        bool visible =
            shifts["mode"] == "ALL" || (shifts["mode"] == "WORKING" && !rest) ||
            (shifts["mode"] == "SPECIAL" && !rest &&
             !has(shifts["normalShiftIds"], sh.id)) ||
            (shifts["mode"] == "MANUAL" && has(shifts["shiftIds"], sh.id));
        if (rest && !o["showRest"].get<bool>())
          c["state"] = "FILTERED_REST";
        else if (rest)
          c["state"] = "REST";
        else if (!visible || (shifts["hideNormal"].get<bool>() &&
                              has(shifts["normalShiftIds"], sh.id)))
          c["state"] = "FILTERED_SHIFT";
        else {
          c["state"] = "WORKING";
          c["shiftId"] = sh.id;
          c["shiftLabel"] = sh.label;
          c["intervals"] = assignment.contains("intervals")
                               ? assignment["intervals"]
                               : s.intervals(e, d, t, profile)["intervals"];
          int n = 0;
          for (auto &i : c["intervals"]) {
            i["uid"] = uid(Json::array({s.source["id"], id, at, sh.id, n++}));
            try {
              auto begin =
                  instant(s.source["calendar"]["timezone"], d,
                          minutes(i["start"]), i.value("startFold", -1));
              auto end = instant(s.source["calendar"]["timezone"],
                                 d + i["endDayOffset"].get<int>(),
                                 minutes(i["end"]), i.value("endFold", -1));
              if (end <= begin)
                throw Error("EXPORT_TIME", "/intervals",
                            "Resolved export interval must have positive "
                            "elapsed duration");
              i["startUtcMinute"] = begin;
              i["endUtcMinute"] = end;
            } catch (const Error &error) {
              i["timeError"] = {{"code", error.code},
                                {"message", error.what()}};
            }
          }
        }
      }
      c["uid"] = uid(Json::array({s.source["id"], id, at, c["state"]}));
      out["cells"].push_back(c);
    }
  }
  return out;
}
std::string calendarViewCsv(const Json &v) {
  std::map<std::string, std::string> names, profiles;
  for (auto &e : v["employees"])
    names[e["id"]] = e["label"];
  for (auto &d : v["days"])
    profiles[d["date"]] = d["profileLabel"];
  std::ostringstream out;
  out << "Date,Employee,State,Shift,Actual intervals,Week profile,Absence "
         "details\r\n";
  for (auto &c : v["cells"]) {
    std::string times;
    for (auto &i : c["intervals"]) {
      if (!times.empty())
        times += " | ";
      times += i["start"].get<std::string>() + "-" +
               i["end"].get<std::string>() +
               (i["endDayOffset"] == 1 ? " (+1 day)" : "");
    }
    out << quote(c["date"]) << ',' << quote(names[c["employeeId"]]) << ','
        << quote(c["state"]) << ',' << quote(c.value("shiftLabel", "")) << ','
        << quote(times) << ',' << quote(profiles[c["date"]]) << ','
        << quote(c.value("absenceReasons", Json::array()).dump()) << "\r\n";
  }
  return out.str();
}
} // namespace rostercore
