#include "rostercore/core.hpp"
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
using namespace rostercore;
static Json read(const std::string &path) {
  std::string text;
  std::ifstream file;
  std::istream *in = &std::cin;
  if (path != "-") {
    file.open(path);
    if (!file)
      throw Error("IO", "/", "Cannot open: " + path);
    in = &file;
  }
  char buffer[8192];
  while (in->good()) {
    in->read(buffer, sizeof(buffer));
    text.append(buffer, size_t(in->gcount()));
    if (text.size() > 8 * 1024 * 1024)
      throw Error("INPUT_LIMIT", "/", "Input exceeds 8 MiB");
  }
  size_t depth = 0;
  bool quoted = false, escaped = false;
  for (char c : text) {
    if (quoted) {
      if (escaped)
        escaped = false;
      else if (c == '\\')
        escaped = true;
      else if (c == '"')
        quoted = false;
    } else if (c == '"')
      quoted = true;
    else if (c == '{' || c == '[') {
      if (++depth > 80)
        throw Error("INPUT_LIMIT", "/", "JSON nesting exceeds 80");
    } else if ((c == '}' || c == ']') && depth)
      --depth;
  }
  try {
    std::vector<std::set<std::string>> keys;
    return Json::parse(text, [&](int, Json::parse_event_t event, Json &parsed) {
      if (event == Json::parse_event_t::object_start)
        keys.emplace_back();
      else if (event == Json::parse_event_t::key) {
        if (!keys.back().insert(parsed.get<std::string>()).second)
          throw Error("JSON_DUPLICATE_KEY", "/",
                      "Duplicate JSON object key: " +
                          parsed.get<std::string>());
      } else if (event == Json::parse_event_t::object_end)
        keys.pop_back();
      return true;
    });
  } catch (const Error &) {
    throw;
  } catch (const std::exception &e) {
    throw Error("JSON_PARSE", "/", e.what());
  }
}
int main(int argc, char **argv) {
  try {
    if (!std::getenv("ROSTERCORE_SCHEMA_DIR")) {
      auto installed = std::filesystem::absolute(argv[0]).parent_path() /
                       "../share/rostercore/schemas";
      if (std::filesystem::exists(installed)) {
#ifdef _WIN32
        _putenv_s("ROSTERCORE_SCHEMA_DIR", installed.string().c_str());
#else
        setenv("ROSTERCORE_SCHEMA_DIR", installed.string().c_str(), 0);
#endif
      }
    }
    std::string command = argc > 1 ? argv[1] : "help";
    if (command == "version") {
      std::cout << version << '\n';
      return 0;
    }
    if (command == "help" || command == "--help") {
      std::cout << "RosterCore " << version
                << "\nCommands: validate|solve|context SCENARIO|-; verify "
                   "SCENARIO RESULT; consolidate SCENARIO RESULT THROUGH; "
                   "import-policy|sync-hr|rebuild-history SCENARIO DOCUMENT "
                   "[--apply] [--mappings FILE]\n";
      return 0;
    }
    if (argc < 3)
      throw Error("ARGUMENTS", "/", "Missing input file; use - for stdin");
    auto j = read(argv[2]);
    Json out;
    if (command == "validate") {
      validate(j);
      out = response("VALID");
    } else if (command == "solve")
      out = solve(j);
    else if (command == "context")
      out = aiContext(j);
    else if (command == "verify" || command == "consolidate") {
      if (argc < 4)
        throw Error("ARGUMENTS", "/", "Missing result file");
      auto result = read(argv[3]);
      if (command == "verify")
        out = verify(j, result);
      else {
        if (argc < 5)
          throw Error("ARGUMENTS", "/", "Missing consolidation date");
        out = consolidate(j, result, argv[4]);
      }
    } else if (command == "import-policy" || command == "sync-hr" ||
               command == "rebuild-history") {
      if (argc < 4)
        throw Error("ARGUMENTS", "/", "Missing import document");
      auto document = read(argv[3]);
      bool apply = false;
      Json mappings = Json::object();
      for (int i = 4; i < argc; ++i) {
        std::string option = argv[i];
        if (option == "--apply")
          apply = true;
        else if (option == "--mappings" && i + 1 < argc)
          mappings = read(argv[++i]);
        else
          throw Error("ARGUMENTS", "/", "Unknown import option: " + option);
      }
      out = command == "import-policy"
                ? importPolicy(j, document, !apply, mappings)
                : (command == "sync-hr" ? syncHR(j, document, !apply)
                                        : rebuildHistory(j, document, !apply));
    } else
      throw Error("COMMAND", "/", "Unknown command: " + command);
    std::cout << out.dump(2) << '\n';
    return out["status"] == "VALIDATION_ERROR" ||
                   out["status"] == "MODEL_INVALID"
               ? 2
               : 0;
  } catch (const Error &e) {
    std::cout << failure(e).dump(2) << '\n';
    return 2;
  } catch (const std::exception &e) {
    std::cout << failure(Error("INTERNAL", "/", e.what())).dump(2) << '\n';
    return 3;
  }
}
