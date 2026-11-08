# Third-party notices

Original RosterCore code is Apache-2.0; see the root LICENSE. Dependencies retain their licenses. The dependency archives contain their complete notices and must accompany redistribution when required.

| Component | Version | License | Use |
| --- | --- | --- | --- |
| Google OR-Tools | 9.15.6755 | Apache-2.0 and bundled dependency notices | CP-SAT backend |
| nlohmann/json | 3.12.0 | MIT | Public JSON |
| pboettch/json-schema-validator | 2.4.0 | MIT | JSON Schema draft-07 validation |
| React / React DOM | 19.2.0 | MIT | Local UI |
| Vite | 7.2.2 | MIT | UI tooling |
| TypeScript | 5.9.3 | Apache-2.0 | UI compilation |
| Playwright | 1.56.1 | Apache-2.0 | Browser tests |

OR-Tools prebuilt distributions include additional libraries (Abseil, protobuf, RE2, compression and optimization libraries). Preserve their supplied licenses when packaging them. `scripts/bootstrap.py --source` disables optional SCIP/COIN-OR/HiGHS; CP-SAT remains the required backend. This project does not relicense third-party code.

## AGENTS.md template attribution

Adapted from [ossacolsale/AgentForge-Universal-AGENTS.md](https://github.com/ossacolsale/AgentForge-Universal-AGENTS.md).

MIT License

Copyright (c) 2026 Giancarlo Mangiagli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
