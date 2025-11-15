// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getWidgets: () => ipcRenderer.invoke('get-widgets'),
  openWidget: (id: string, payload?: any) => ipcRenderer.invoke('open-widget', id, payload),
  executeAction: (actionId: string, selectedText?: string) => ipcRenderer.invoke('execute-action', actionId, selectedText),
  getSuggestions: (query: string) => ipcRenderer.invoke('get-suggestions', query),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  setPreferences: (prefs: any) => ipcRenderer.invoke('set-preferences', prefs),
  getCapturedText: () => ipcRenderer.invoke('get-captured-text'),
  showActionPopover: (resultText: string, position: { x: number; y: number }) => 
    ipcRenderer.invoke('show-action-popover', resultText, position),
  // Component rendering events
  onComponentInit: (cb: (event: any, data: { type: string; props?: any }) => void) => 
    ipcRenderer.on('component-init', cb),
  // Legacy events for backward compatibility
  onWidgetInit: (cb: (event: any, payload: any) => void) => ipcRenderer.on('widget-init', cb),
  onPaletteOpened: (cb: (event: any, data: any) => void) => ipcRenderer.on('palette-opened', cb),
  onTranslatorInit: (cb: (event: any, data: any) => void) => ipcRenderer.on('translator-init', cb),
})
