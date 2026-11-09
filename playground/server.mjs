import http from "node:http";
import { readFile, mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, "..");
const port = Number(process.env.PORT || 4317),
  production = process.argv.includes("--production");
const executable =
  process.env.ROSTERCORE_CLI ||
  path.join(
    root,
    "build",
    process.platform === "win32" ? "Release/rostercore.exe" : "rostercore",
  );
const actions = new Set([
  "validate",
  "solve",
  "verify",
  "verify-quality",
  "archives",
  "change-set",
  "import-scenario",
  "improve",
  "consolidate",
  "context",
  "import-policy",
  "sync-hr",
  "rebuild-history",
  "regenerate",
  "inspect",
  "inspect-patterns",
  "select",
  "migrate",
]);
let running = 0;
const vite = production
  ? null
  : await (
      await import("vite")
    ).createServer({
      root: here,
      server: { middlewareMode: true, hmr: { host: "127.0.0.1" } },
      appType: "spa",
    });
function json(res, code, value) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function run(body) {
  if (!actions.has(body.action)) throw new Error("Unsupported action");
  if (running >= 2) throw new Error("Two engine processes are already running");
  running++;
  let dir;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "rostercore-"));
    const input = path.join(dir, "scenario.json");
    await writeFile(
      input,
      ["verify", "verify-quality"].includes(body.action) &&
        typeof body.scenarioEncoding === "string"
        ? body.scenarioEncoding
        : JSON.stringify(body.scenario),
    );
    const args = [body.action, input];
    if (
      [
        "verify",
        "verify-quality",
        "archives",
        "change-set",
        "import-scenario",
        "improve",
        "consolidate",
        "import-policy",
        "sync-hr",
        "rebuild-history",
        "regenerate",
      ].includes(body.action)
    ) {
      const extra = path.join(dir, "document.json");
      await writeFile(extra, JSON.stringify(body.document ?? body.result));
      args.push(extra);
    }
    if (["inspect", "inspect-patterns"].includes(body.action))
      args.push(body.onDate || body.scenario.calendar.start);
    if (body.action === "select") {
      const selector = path.join(dir, "selector.json");
      await writeFile(selector, JSON.stringify(body.selector));
      args.push(selector, body.onDate || body.scenario.calendar.start);
    }
    if (body.action === "verify-quality") args.push(String(body.budget ?? 15));
    if (body.action === "consolidate") {
      if (typeof body.through !== "string")
        throw new Error("Missing consolidation date");
      args.push(body.through);
    }
    if (
      [
        "import-policy",
        "sync-hr",
        "rebuild-history",
        "change-set",
        "import-scenario",
      ].includes(body.action) &&
      body.apply === true
    )
      args.push("--apply");
    if (body.action === "import-policy" && body.mappings) {
      const p = path.join(dir, "mappings.json");
      await writeFile(p, JSON.stringify(body.mappings));
      args.push("--mappings", p);
    }
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          ROSTERCORE_SCHEMA_DIR: path.join(root, "schemas"),
        },
      });
      let stdout = "",
        stderr = "",
        limit = false;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Engine process exceeded 620 seconds"));
      }, 620000);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 32 * 1024 * 1024) {
          limit = true;
          child.kill();
        }
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 4096) stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Cannot start engine: ${error.message}. Build the C++ CLI first or set ROSTERCORE_CLI.`,
          ),
        );
      });
      child.on("close", () => {
        clearTimeout(timer);
        try {
          if (limit) throw new Error("Engine output exceeds 32 MiB");
          resolve(JSON.parse(stdout));
        } catch {
          reject(
            new Error(
              limit
                ? "Engine output exceeds 32 MiB"
                : `Engine returned invalid JSON. ${stderr}`,
            ),
          );
        }
      });
    });
  } finally {
    running--;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || "";
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
      return json(res, 403, { error: "Loopback host required" });
    const origin = req.headers.origin;
    if (
      origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)
    )
      return json(res, 403, { error: "Cross-origin requests are not allowed" });
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/health")
      return json(res, 200, { status: "ready", engine: executable });
    if (
      req.method === "GET" &&
      [
        "/api/example-evolution",
        "/api/example-automatic",
        "/api/example-patterns",
      ].includes(url.pathname)
    )
      return json(
        res,
        200,
        JSON.parse(
          await readFile(
            path.join(
              root,
              "examples",
              url.pathname.endsWith("patterns")
                ? "automatic-work-patterns.json"
                : url.pathname.endsWith("automatic")
                  ? "pharmacy-automatic-weeks.json"
                  : "pharmacy-evolution.json",
            ),
            "utf8",
          ),
        ),
      );
    if (req.method === "GET" && url.pathname === "/api/example-simple")
      return json(
        res,
        200,
        JSON.parse(
          await readFile(
            path.join(root, "AI_EXAMPLES/01-create-scenario.json"),
            "utf8",
          ),
        ),
      );
    if (req.method === "GET" && url.pathname === "/api/example")
      return json(
        res,
        200,
        JSON.parse(
          await readFile(path.join(root, "examples/pharmacy.json"), "utf8"),
        ),
      );
    if (req.method === "GET" && url.pathname === "/api/ai-resources") {
      const compact = (schema) => {
        const defs = schema.definitions ?? {};
        const root = { ...schema };
        delete root.definitions;
        const used = new Set();
        const visit = (v) => {
          if (!v || typeof v !== "object") return;
          if (
            typeof v.$ref === "string" &&
            v.$ref.startsWith("#/definitions/")
          ) {
            const key = v.$ref.slice(14);
            if (!used.has(key)) {
              used.add(key);
              visit(defs[key]);
            }
          }
          for (const x of Object.values(v)) visit(x);
        };
        visit(root);
        root.definitions = Object.fromEntries(
          [...used].sort().map((k) => [k, defs[k]]),
        );
        return root;
      };
      const guides = {};
      for (const name of [
        "AI_SCENARIO_AUTHORING_GUIDE.md",
        "AI_SCENARIO_UPDATE_GUIDE.md",
        "AI_POLICY_AUTHORING_GUIDE.md",
      ])
        guides[name] = await readFile(path.join(root, name), "utf8");
      const schemas = {};
      for (const name of [
        "scenario",
        "scenario-change-set",
        "planning-policy",
        "hr-events",
      ])
        schemas[name] = compact(
          JSON.parse(
            await readFile(
              path.join(root, "schemas", name + ".schema.json"),
              "utf8",
            ),
          ),
        );
      const capabilities = JSON.parse(
        await readFile(path.join(root, "AI_CAPABILITIES.json"), "utf8"),
      );
      return json(res, 200, {
        engineVersion: capabilities.engineVersion,
        guides,
        schemas,
        capabilities,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/guide") {
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      return res.end(
        await readFile(path.join(root, "AI_POLICY_AUTHORING_GUIDE.md")),
      );
    }
    if (req.method === "GET" && url.pathname === "/api/operators")
      return json(
        res,
        200,
        JSON.parse(
          await readFile(path.join(root, "schemas/operators.json"), "utf8"),
        ),
      );
    if (req.method === "POST" && url.pathname === "/api/run") {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, 415, { error: "Expected application/json" });
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (Buffer.byteLength(text) > 20 * 1024 * 1024)
          return json(res, 413, { error: "Request exceeds 20 MiB" });
      }
      return json(res, 200, await run(JSON.parse(text)));
    }
    if (url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "Unknown API endpoint" });
    if (vite)
      return vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end();
      });
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, ""),
      file = path.resolve(here, "dist", relative || "index.html");
    if (!file.startsWith(path.join(here, "dist") + path.sep))
      return json(res, 403, { error: "Invalid path" });
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      file = path.join(here, "dist/index.html");
    }
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".ttf": "font/ttf",
      ".svg": "image/svg+xml",
      ".json": "application/json",
    };
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await readFile(file));
  } catch (error) {
    json(res, 400, { error: error.message });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`RosterCore playground: http://127.0.0.1:${port}`),
);
async function close() {
  server.close();
  await vite?.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
