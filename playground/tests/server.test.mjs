import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
for (const production of [true, false])
  test(`${production ? "production" : "development"} API preserves loopback SPA behavior and rejects foreign Host/Origin`, async () => {
    const port = production ? 4319 : 4320,
      base = `http://127.0.0.1:${port}`;
    const server = spawn(
      process.execPath,
      ["server.mjs", ...(production ? ["--production"] : [])],
      { env: { ...process.env, PORT: String(port) }, stdio: "pipe" },
    );
    try {
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try {
          ready = (await fetch(base + "/api/health")).ok;
          if (ready) break;
        } catch {}
        await delay(100);
      }
      assert.ok(ready, "server startup");
      const s = await (await fetch(base + "/api/example")).json();
      const response = await fetch(base + "/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate", scenario: s }),
      });
      assert.equal((await response.json()).status, "VALID");
      const blocked = await fetch(base + "/api/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://foreign.example",
        },
        body: "{}",
      });
      assert.equal(blocked.status, 403);
      const host = await new Promise((resolve, reject) => {
        const req = http.get(
          base + "/",
          { headers: { Host: "foreign.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
      });
      assert.equal(host, 403);
      const home = await fetch(base + "/");
      assert.equal(home.status, 200);
      assert.match(await home.text(), /RosterCore/);
      const spa = await fetch(base + "/local-calendar");
      assert.equal(spa.status, 200);
      assert.match(await spa.text(), /RosterCore/);
      if (!production) {
        const module = await fetch(base + "/src/main.tsx");
        assert.equal(module.status, 200);
        assert.match(await module.text(), /createRoot/);
      }
    } finally {
      server.kill();
    }
  });
