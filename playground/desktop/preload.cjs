const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("rosterCore", {
  chooseFile: (operation, suggestedPath) => ipcRenderer.invoke("workspace:choose-file", operation, suggestedPath),
});
