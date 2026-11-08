#include "rostercore/core.hpp"
#include <iostream>
using namespace rostercore;
void expect(bool value) {
  if (!value)
    throw std::runtime_error("Core invariant failed");
}
int main() {
  expect(sha256("") ==
         "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  expect(sha256("abc") ==
         "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  auto q = Rational(1, 3) + Rational(1, 6);
  expect(q.n == 1 && q.d == 2);
  q = q - Rational(2, 3);
  expect(q.n == -1 && q.d == 6);
  expect(weekday(day("2026-01-26")) == 1);
  expect(isoWeek(day("2021-01-01")) == "2020-W53");
  expect(date(day("2024-02-29")) == "2024-02-29");
  bool rejected = false;
  try {
    checked(1000000000000LL, 2, true);
  } catch (const Error &) {
    rejected = true;
  }
  expect(rejected);
  std::cout << "Hash, rational, date and numeric invariants passed\n";
}
