import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, request } from "node:https";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { isIPv4 } from "node:net";
import path from "node:path";
import { emptyWorkspace, matches, WorkspaceConflict, WorkspaceStore, workspaceVersion } from "./workspace-store.mjs";
import { workspaceOperation } from "./workspace-operations.mjs";

const maxBody = 32 * 1024 * 1024;
const revisionRoute = /^\/api\/workspace\/revisions\/(\d+)$/;
const sharedRoutes = new Set(["/api/workspace", "/api/workspace/run", "/api/workspace/revisions", "/api/workspace/status"]);
const digest = (value) => createHash("sha256").update(value).digest();

export function json(res, code, value) {
  res.writeHead(code, {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

export async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? ""))
    throw Object.assign(new Error("Expected application/json"), { statusCode: 415 });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody)
      throw Object.assign(new Error("Request exceeds 32 MiB"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function apiError(res, error) {
  const status = error instanceof WorkspaceConflict ? 409 : error.statusCode ?? 400;
  json(res, status, { error: error.message, code: status === 409 ? "WORKSPACE_CONFLICT" :
    status === 503 ? "WORKSPACE_OFFLINE" : undefined });
}

function connectionOptions({ url, token, certificate }) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
      endpoint.pathname !== "/" || endpoint.search || endpoint.hash)
    throw new Error("Enter the HTTPS address of the shared workspace.");
  if (typeof token !== "string" || token.length < 16 || /[^\x21-\x7e]/.test(token))
    throw new Error("Provide the shared access token.");
  if (certificate && !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(certificate.trim()))
    throw new Error("Provide a PEM certificate from the workspace host.");
  return { endpoint, token, certificate: certificate?.trim() || undefined };
}

async function forward(connection, pathname, method = "GET", body) {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = request(new URL(pathname, connection.endpoint), {
      method, ca: connection.certificate, minVersion: "TLSv1.2",
      headers: { Authorization: `Bearer ${connection.token}`, ...(encoded === undefined ? {} : {
        "Content-Type": "application/json", "Content-Length": Buffer.byteLength(encoded),
      }) },
    }, async (incoming) => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size > maxBody * 2) throw new Error("Shared workspace response is too large.");
          chunks.push(chunk);
        }
        resolve({ status: incoming.statusCode, payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch (error) {
        reject(error);
      }
    });
    const connectionTimer = setTimeout(() => outgoing.destroy(new Error("Shared workspace connection timed out.")), 8_000);
    outgoing.on("socket", (socket) => {
      if (socket.connecting) socket.once("secureConnect", () => clearTimeout(connectionTimer));
      else clearTimeout(connectionTimer);
    });
    outgoing.on("close", () => clearTimeout(connectionTimer));
    outgoing.setTimeout(method === "POST" ? 640_000 : 8_000,
      () => outgoing.destroy(new Error("Shared workspace request timed out.")));
    outgoing.on("error", reject);
    outgoing.end(encoded);
  }).catch((error) => {
    throw Object.assign(new Error(`Cannot reach the shared workspace. ${error.message}`), { statusCode: 503 });
  });
}

export function createWorkspaceApi(run, { filename, settings, hostMode = false, demoScenario } = {}) {
  const fixedFile = Boolean(filename);
  const saved = !filename && settings && existsSync(settings);
  let warning;
  let selectedByUser = Boolean(saved || fixedFile);
  let store;
  try {
    const selected = filename ?? (saved ? JSON.parse(readFileSync(settings, "utf8")).path :
      settings ? path.join(path.dirname(settings), "workspace.sqlite") : ":memory:");
    store = new WorkspaceStore(selected, { create: !saved && selected !== ":memory:" && !existsSync(selected) });
  } catch (error) {
    if (!saved) throw error;
    store = new WorkspaceStore(":memory:");
    warning = "The previously selected workspace could not be opened. Choose a local or shared workspace.";
  }
  let connection;
  let session = randomUUID();
  const tagged = (workspace) => ({ ...workspace, session });
  let fileBusy = false;
  let running = 0;
  const getLocation = () => ({
    mode: connection ? "CLIENT" : hostMode ? "HOST" : "LOCAL",
    location: connection ? connection.endpoint.origin : store.filename,
    warning: connection ? undefined : warning,
    selected: Boolean(connection || selectedByUser) && !warning,
  });

  async function shared(req, res, pathname, local = false) {
    if (req.method === "GET" && pathname === "/api/workspace/status")
      return json(res, 200, { status: "connected" });
    if (req.method === "GET" && pathname === "/api/workspace")
      return json(res, 200, local ? tagged(store.read()) : store.read());
    if (req.method === "GET" && pathname === "/api/workspace/revisions")
      return json(res, 200, store.revisions());
    const revision = revisionRoute.exec(pathname);
    if (req.method === "GET" && revision)
      return json(res, 200, store.revision(Number(revision[1])));
    if (req.method === "POST" && pathname === "/api/workspace/run") {
      const body = await readJson(req);
      if (fileBusy) throw new Error("Wait for the current workspace operation to finish.");
      const active = store;
      const before = active.read();
      if (!matches(before, body.expected) || (local && body.expected?.session !== session)) throw new WorkspaceConflict();
      running++;
      try {
        const { result, next } = await workspaceOperation(run, before, body);
        if (store !== active || !matches(active.read(), body.expected)) throw new WorkspaceConflict();
        const workspace = next !== before ? active.write(before, next) : undefined;
        delete result.archives;
        return json(res, 200, { result, workspace: local && workspace ? tagged(workspace) : workspace });
      } finally {
        running--;
      }
    }
    return json(res, 405, { error: "Unsupported workspace request" });
  }

  async function local(req, res, pathname) {
    if (req.method === "GET" && pathname === "/api/workspace/location")
      return json(res, 200, getLocation());
    if (pathname === "/api/demo" && req.method === "POST") {
      const { snapshot, ...body } = await readJson(req);
      const before = snapshot ?? { ...emptyWorkspace(), scenario: await demoScenario() };
      if (snapshot && !matches(before, body.expected)) throw new WorkspaceConflict();
      if (!snapshot) return json(res, 200, before);
      const { result, next } = await workspaceOperation(run, before, body);
      if (next !== before) next.revision++;
      return json(res, 200, { result, workspace: next !== before ? next : undefined });
    }
    if (req.method === "POST" && pathname === "/api/workspace/location") {
      if (hostMode) throw new Error("The host serves its configured SQLite file.");
      if (fileBusy || running) throw new Error("Wait for the current workspace operation to finish.");
      const body = await readJson(req);
      if (fileBusy || running) throw new Error("Wait for the current workspace operation to finish.");
      fileBusy = true;
      try {
        if (body.operation === "CONNECT") {
          const candidate = connectionOptions(body);
          const result = await forward(candidate, "/api/workspace");
          if (result.status !== 200) return json(res, result.status, result.payload);
          connection = candidate;
          session = randomUUID();
          return json(res, 200, { ...getLocation(), workspace: tagged(result.payload) });
        }
        if (body.operation === "DISCONNECT") {
          connection = undefined;
          session = randomUUID();
          return json(res, 200, { ...getLocation(), workspace: tagged(store.read()) });
        }
        if (connection) throw new Error("Disconnect before opening a local workspace.");
        if (fixedFile) throw new Error("This process uses the configured workspace file.");
        if (!["CREATE", "OPEN", "RESTORE"].includes(body.operation)) throw new Error("Unknown file operation");
        if (body.operation === "RESTORE") {
          const backup = new WorkspaceStore(body.source);
          try {
            await checkWorkspace(backup);
            await backup.backup(body.path);
          } finally {
            backup.close();
          }
        }
        const candidate = new WorkspaceStore(body.path, { create: body.operation === "CREATE" });
        try {
          if (body.operation === "OPEN") await checkWorkspace(candidate);
          if (settings) {
            writeFileSync(settings + ".tmp", JSON.stringify({ path: candidate.filename }), { mode: 0o600 });
            renameSync(settings + ".tmp", settings);
          }
        } catch (error) {
          candidate.close();
          throw error;
        }
        store.close();
        store = candidate;
        selectedByUser = true;
        warning = undefined;
        session = randomUUID();
        return json(res, 200, { ...getLocation(), workspace: tagged(store.read()) });
      } finally {
        fileBusy = false;
      }
    }
    if (req.method === "POST" && pathname === "/api/workspace/backup-file") {
      if (connection) throw new Error("Use a JSON backup or back up SQLite on the host.");
      const body = await readJson(req);
      if (fileBusy) throw new Error("Wait for the current workspace operation to finish.");
      fileBusy = true;
      try {
        await store.backup(body.path);
        return json(res, 200, { status: "BACKED_UP" });
      } finally {
        fileBusy = false;
      }
    }
    if (connection) {
      if (!sharedRoutes.has(pathname) && !revisionRoute.test(pathname))
        return json(res, 404, { error: "Unknown shared workspace route" });
      const destination = connection;
      const requestedSession = session;
      const body = req.method === "POST" ? await readJson(req) : undefined;
      if (requestedSession !== session || (body && (fileBusy || body.expected?.session !== session)))
        throw new WorkspaceConflict();
      running++;
      try {
        const { status, payload } = await forward(destination, pathname, req.method, body);
        if (status === 200 && pathname === "/api/workspace") return json(res, status, tagged(payload));
        if (status === 200 && payload.workspace) payload.workspace = tagged(payload.workspace);
        return json(res, status, payload);
      } finally {
        running--;
      }
    }
    return shared(req, res, pathname, true);
  }

  async function checkWorkspace(candidate) {
    const snapshot = candidate.read();
    if (!snapshot.scenario && !snapshot.archives.length) return;
    const result = await run({ action: "archives", scenario: snapshot.scenario,
      document: { operation: "BACKUP", archives: snapshot.archives, dryRun: true, createdAt: new Date().toISOString() } });
    if (result.status !== "EXPORTED") throw new Error("This SQLite workspace failed native validation.");
  }

  function listen({ address, port, token, key, cert }) {
    const [a, b] = String(address).split(".").map(Number);
    if (!(isIPv4(address) && (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))))
      throw new Error("Bind the host explicitly to a private IPv4 address.");
    connectionOptions({ url: `https://${address}`, token });
    const authorization = digest(`Bearer ${token}`);
    const lan = createServer({ key: readFileSync(key), cert: readFileSync(cert), minVersion: "TLSv1.2" }, async (req, res) => {
      try {
        const pathname = new URL(req.url, "https://localhost").pathname;
        if (req.headers.origin || !timingSafeEqual(authorization, digest(req.headers.authorization ?? "")))
          return json(res, 401, { error: "Shared workspace authentication failed." });
        if (!sharedRoutes.has(pathname) && !revisionRoute.test(pathname)) return json(res, 404, { error: "Unknown shared workspace route" });
        await shared(req, res, pathname);
      } catch (error) {
        apiError(res, error);
      }
    });
    lan.listen(port, address);
    return lan;
  }

  return { local, listen, close: () => store.close() };
}
