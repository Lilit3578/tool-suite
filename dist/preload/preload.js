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
  // Mouse events for click-through transparent areas
  setIgnoreMouseEvents: (ignore) => import_electron.ipcRenderer.send("set-ignore-mouse-events", ignore),
  convertCurrency: (params) => import_electron.ipcRenderer.invoke("convert-currency", params),
  getCurrencySettings: () => import_electron.ipcRenderer.invoke("get-currency-settings"),
  saveCurrencySettings: (settings) => import_electron.ipcRenderer.invoke("save-currency-settings", settings),
  // Window resizing for auto-sizing
  resizeWindow: (height) => import_electron.ipcRenderer.send("resize-window", height),
  // Clipboard item pasting
  pasteClipboardItem: (id) => import_electron.ipcRenderer.invoke("paste-clipboard-item", id),
  // Get window position for popover positioning
  getWindowPosition: () => import_electron.ipcRenderer.invoke("get-window-position"),
  // Component rendering events
  onComponentInit: (cb) => import_electron.ipcRenderer.on("component-init", cb),
  // Legacy events for backward compatibility
  onWidgetInit: (cb) => import_electron.ipcRenderer.on("widget-init", cb),
  onPaletteOpened: (cb) => import_electron.ipcRenderer.on("palette-opened", cb),
  hideCurrentWindow: () => import_electron.ipcRenderer.invoke("hide-current-window"),
  onTranslatorInit: (cb) => import_electron.ipcRenderer.on("translator-init", cb)
});
