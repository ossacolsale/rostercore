import http from "node:http";
import { readFile, mkdtemp, writeFile, rm, stat, mkdir, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiError, createWorkspaceApi, json, readJson } from "./workspace-api.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)),
  root = process.env.ROSTERCORE_RESOURCES || path.resolve(here, "..");
const port = Number(process.env.PORT || 4317),
  headless = process.argv.includes("--headless") || process.env.ROSTERCORE_HEADLESS === "1",
  production = headless || process.argv.includes("--production") || process.env.ROSTERCORE_PRODUCTION === "1";
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
const children = new Set();
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
      children.add(child);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
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
        children.delete(child);
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
const readDocument = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), "utf8"));
const demoScenario = () => readDocument("AI_EXAMPLES/01-create-scenario.json");
const filename = process.env.ROSTERCORE_WORKSPACE;
const hostAddress = process.env.ROSTERCORE_LISTEN;
const settings = process.env.ROSTERCORE_SETTINGS ?? (!filename && !hostAddress
  ? path.join(homedir(), ".rostercore", "location.json") : undefined);
if (headless && !hostAddress) throw new Error("Set ROSTERCORE_LISTEN for headless hosting.");
if (hostAddress && (!filename || filename === ":memory:"))
  throw new Error("Set ROSTERCORE_WORKSPACE to a local SQLite file for hosting.");
if (settings) await mkdir(path.dirname(settings), { recursive: true, mode: 0o700 });
const workspace = createWorkspaceApi(run, { filename, settings, hostMode: Boolean(hostAddress), demoScenario });
export const lan = hostAddress ? workspace.listen({
  address: hostAddress, port: Number(process.env.ROSTERCORE_TLS_PORT || 4319),
  token: process.env.ROSTERCORE_TOKEN, key: process.env.ROSTERCORE_TLS_KEY,
  cert: process.env.ROSTERCORE_TLS_CERT,
}) : undefined;

function compact(schema) {
  const { definitions = {}, ...document } = schema;
  const used = new Set();
  const visit = (v) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.$ref === "string" && v.$ref.startsWith("#/definitions/")) {
      const key = v.$ref.slice(14);
      if (!used.has(key)) {
        used.add(key);
        visit(definitions[key]);
      }
    }
    for (const child of Object.values(v)) visit(child);
  };
  visit(document);
  return { ...document, definitions: Object.fromEntries([...used].sort().map((key) => [key, definitions[key]])) };
}

async function aiResources(mode) {
  const full = mode === "full";
  const creation = mode === "create";
  const capabilities = await readDocument("AI_CAPABILITIES.json");
  const guides = full ? ["SCENARIO_AUTHORING", "SCENARIO_UPDATE", "POLICY_AUTHORING"] :
    [creation ? "SCENARIO_AUTHORING" : "SCENARIO_UPDATE"];
  const schemas = full ? (await readdir(path.join(root, "schemas"))).filter((file) => file.endsWith(".schema.json")).map((file) => file.replace(".schema.json", "")) :
    [creation ? "scenario" : "scenario-change-set"];
  const examples = full ? capabilities.examples : [capabilities.examples[creation ? 0 : 2]];
  const collect = (names, read) => Promise.all(names.map(async (name) => [name, await read(name)])).then(Object.fromEntries);
  return {
    engineVersion: capabilities.engineVersion,
    ...(full ? { capabilities } : { capabilities: {
      preferredScenarioVersion: capabilities.preferredScenarioVersion,
      timeConventions: capabilities.timeConventions,
      ...(!creation ? { operations: capabilities.operations } : {}),
    } }),
    guides: await collect(guides, (name) => readFile(path.join(root, `AI_${name}_GUIDE.md`), "utf8")),
    schemas: await collect(schemas, async (name) => compact(await readDocument(`schemas/${name}.schema.json`))),
    examples: await collect(examples, (name) => readDocument(`AI_EXAMPLES/${name}`)),
  };
}

export const server = headless ? undefined : http.createServer(async (req, res) => {
  try {
    const localPort = server.address().port;
    const host = req.headers.host || "";
    if (![`127.0.0.1:${localPort}`, `localhost:${localPort}`].includes(host))
      return json(res, 403, { error: "Loopback host required" });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`)
      return json(res, 403, { error: "Cross-origin requests are not allowed" });
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/demo" || url.pathname === "/api/workspace" || url.pathname.startsWith("/api/workspace/"))
      return await workspace.local(req, res, url.pathname);
    if (req.method === "GET" && url.pathname === "/api/health")
      return json(res, 200, { status: "ready", engine: executable });
    if (req.method === "GET" && url.pathname === "/api/example")
      return json(res, 200, await readDocument("examples/pharmacy.json"));
    if (req.method === "GET" && url.pathname === "/api/ai-resources")
      return json(res, 200, await aiResources(url.searchParams.get("mode")));
    if (req.method === "POST" && url.pathname === "/api/run")
      return json(res, 200, await run(await readJson(req)));
    if (url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "Unknown API endpoint" });
    if (vite)
      return vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end();
      });
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.resolve(here, "dist", relative || "index.html");
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
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(await readFile(file));
  } catch (error) {
    apiError(res, error);
  }
});
server?.listen(port, "127.0.0.1", () =>
  console.log(`RosterCore: http://127.0.0.1:${server.address().port}`),
);
lan?.on("listening", () => console.log(`RosterCore workspace: https://${hostAddress}:${lan.address().port}`));

export async function close() {
  for (const child of children) child.kill();
  const stop = (listener) => listener && new Promise((resolve) => listener.close(resolve));
  await Promise.all([stop(server), stop(lan), vite?.close()]);
  workspace.close();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void close().finally(() => process.exit(0)));
