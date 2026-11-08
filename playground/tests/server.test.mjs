import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const port = 4319,
  base = `http://127.0.0.1:${port}`;
test("local API executes the CLI and rejects cross-origin requests", async () => {
  const server = spawn(process.execPath, ["server.mjs", "--production"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "pipe",
  });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
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
  } finally {
    server.kill();
  }
});
