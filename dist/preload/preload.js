"use strict";

// src/main/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  getWidgets: () => import_electron.ipcRenderer.invoke("get-widgets"),
  openWidget: (id, payload) => import_electron.ipcRenderer.invoke("open-widget", id, payload),
  executeAction: (actionId, selectedText) => import_electron.ipcRenderer.invoke("execute-action", actionId, selectedText),
  getSuggestions: (query) => import_electron.ipcRenderer.invoke("get-suggestions", query),
  getPreferences: () => import_electron.ipcRenderer.invoke("get-preferences"),
  setPreferences: (prefs) => import_electron.ipcRenderer.invoke("set-preferences", prefs),
  getCapturedText: () => import_electron.ipcRenderer.invoke("get-captured-text"),
  showActionPopover: (resultText, position) => import_electron.ipcRenderer.invoke("show-action-popover", resultText, position),
  // Component rendering events
  onComponentInit: (cb) => import_electron.ipcRenderer.on("component-init", cb),
  // Legacy events for backward compatibility
  onWidgetInit: (cb) => import_electron.ipcRenderer.on("widget-init", cb),
  onPaletteOpened: (cb) => import_electron.ipcRenderer.on("palette-opened", cb),
  onTranslatorInit: (cb) => import_electron.ipcRenderer.on("translator-init", cb)
});
