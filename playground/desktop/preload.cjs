const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("rosterCore", {
  chooseFile: (operation) => ipcRenderer.invoke("workspace:choose-file", operation),
});
