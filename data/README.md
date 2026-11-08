# Offline calendar data

`catalogues.json` is embedded at CMake configure time. Runtime solving performs no network lookup. The Italian catalogue has a stable version, effective dates, source references and an explicit supported range. Easter Monday is computed from the Gregorian Easter date; local holiday/working-date overrides remain scenario data.

The Europe/Rome transition table was generated from the host's IANA timezone database; its recorded `source` identifies that version. It covers UTC instants from 2000-01-01 to 2101-01-01. The core rejects unsupported elapsed-time zones/ranges and nonexistent local times; folds must disambiguate repeated times. UTC needs no table. Future IANA predictions may change with legislation.

To intentionally update the catalogue, review the sources and supported dates, run `python3 scripts/generate_time_data.py` on a host with current IANA tzdata, inspect the JSON diff, advance the catalogue version when rules change, regenerate schemas/examples if their version references change, and run the calendar/DST tests. The host tzdb is a build-time maintainer tool, not a user runtime dependency. Do not regenerate automatically in CI from an unspecified host version.
