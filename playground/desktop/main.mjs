import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { mkdirSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";

const windowId = "com.ossacolsale.rostercore";
app.setName("RosterCore");
app.setAppUserModelId(windowId);
const data = process.env.ROSTERCORE_DATA_DIR || app.getPath("userData");
if (!path.isAbsolute(data)) {
  dialog.showErrorBox("RosterCore", "ROSTERCORE_DATA_DIR must be an absolute path.");
  app.exit(1);
}
if (process.env.ROSTERCORE_DATA_DIR) {
  mkdirSync(data, { recursive: true, mode: 0o700 });
  app.setPath("userData", data);
}
if (!app.requestSingleInstanceLock()) app.exit(0);

let window;
let backend;
app.on("second-instance", () => {
  if (window?.isMinimized()) window.restore();
  window?.focus();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (!backend) return;
  event.preventDefault();
  const active = backend;
  backend = undefined;
  active.server?.closeAllConnections();
  active.lan?.closeAllConnections();
  Promise.race([active.close(), new Promise((resolve) => setTimeout(resolve, 1000))])
    .finally(() => app.quit());
});

async function start() {
  await app.whenReady();
  if (app.isPackaged) {
    process.env.ROSTERCORE_RESOURCES = path.join(process.resourcesPath, "native");
    process.env.ROSTERCORE_CLI = path.join(process.env.ROSTERCORE_RESOURCES, "bin",
      process.platform === "win32" ? "rostercore.exe" : "rostercore");
  }
  process.env.ROSTERCORE_PRODUCTION = "1";
  process.env.ROSTERCORE_SETTINGS = path.join(data, "location.json");
  process.env.PORT ??= "4316";

  backend = await import("../server.mjs");
  const listeners = [backend.server, backend.lan].filter(Boolean);
  await Promise.all(listeners.map((listener) => listener.listening ? undefined : once(listener, "listening")));
  if (!backend.server) return;
  const origin = `http://127.0.0.1:${backend.server.address().port}`;
  const allowed = (url) => typeof url === "string" && url.startsWith(origin + "/");

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permission === "clipboard-sanitized-write" && allowed(details.requestingUrl));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    permission === "clipboard-sanitized-write" && requestingOrigin === origin);
  window = new BrowserWindow({
    width: 1280, height: 850, minWidth: 480, minHeight: 540, show: false, title: "RosterCore",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!allowed(url)) event.preventDefault();
  });
  ipcMain.handle("workspace:choose-file", async (event, operation) => {
    if (event.sender !== window.webContents || !allowed(event.senderFrame.url) ||
        !["OPEN", "CREATE", "BACKUP"].includes(operation)) return undefined;
    const suggested = process.env.PORTABLE_EXECUTABLE_DIR ?? app.getPath("documents");
    const filters = [{ name: "RosterCore SQLite", extensions: ["sqlite", "sqlite3", "db"] }];
    if (operation === "OPEN") {
      const result = await dialog.showOpenDialog(window, { defaultPath: suggested, filters, properties: ["openFile"] });
      return result.filePaths[0];
    }
    const name = operation === "BACKUP" ? "rostercore-backup.sqlite" : "workspace.sqlite";
    const result = await dialog.showSaveDialog(window, { defaultPath: path.join(suggested, name), filters });
    return result.filePath;
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL(origin);
}

start().catch((error) => {
  dialog.showErrorBox("RosterCore", error.message);
  app.exit(1);
});
