// src/main/ipc-handlers.ts
import { ipcMain, BrowserWindow } from 'electron'
import type { WidgetManager } from './widget-manager'
import { createLogger } from './logger'
import { settingsManager } from './settings-manager'

const logger = createLogger('IPC')

interface MainCallbacks {
  getCapturedText: () => string
  openTranslatorWidget: (selectedText: string) => Promise<BrowserWindow>
  showActionPopover: (resultText: string, position: { x: number; y: number }) => Promise<BrowserWindow>
}

export function registerIpcHandlers(widgetManager: WidgetManager, callbacks?: MainCallbacks) {
  ipcMain.handle('get-widgets', () => {
    return widgetManager.getAllWidgets().map(w => ({
      id: w.id,
      label: w.label,
      icon: w.icon,
      actions: w.actions?.map(a => ({ id: a.id, label: a.label })) ?? [],
    }))
  })

  ipcMain.handle('open-widget', async (_, id: string, payload?: any) => {
    logger.info('open-widget', id, payload)
    try {
      // Special handling for translator widget - use the callback if available
      if (id === 'translator' && callbacks?.openTranslatorWidget) {
        const selectedText = payload?.selectedText || callbacks.getCapturedText()
        logger.info('Opening translator widget with text:', selectedText)
        await callbacks.openTranslatorWidget(selectedText)
        return { success: true }
      }
      await widgetManager.openWidgetWindow(id, payload)
      return { success: true }
    } catch (error) {
      logger.error('Error opening widget:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-captured-text', () => {
    return callbacks?.getCapturedText() || ''
  })

  ipcMain.handle('show-action-popover', async (_, resultText: string, position: { x: number; y: number }) => {
    logger.info('=== IPC show-action-popover handler called ===')
    logger.info('resultText:', resultText)
    logger.info('position:', position)
    logger.info('callbacks?.showActionPopover available:', !!callbacks?.showActionPopover)
    if (callbacks?.showActionPopover) {
      try {
        await callbacks.showActionPopover(resultText, position)
        logger.info('showActionPopover callback completed successfully')
        return { success: true }
      } catch (error) {
        logger.error('Error in showActionPopover callback:', error)
        return { success: false, error: String(error) }
      }
    }
    logger.warn('showActionPopover callback not available')
    return { success: false, error: 'Invalid parameters' }
  })

  ipcMain.handle('execute-action', async (_, actionId: string, selectedText?: string) => {
    logger.info('execute-action', actionId, 'with text:', selectedText)
    try {
      for (const w of widgetManager.getAllWidgets()) {
        const a = w.actions?.find(x => x.id === actionId)
        if (a && typeof a.handler === 'function') {
          logger.info('Found action handler for:', actionId)
          settingsManager.incrementUsage(actionId)
          try {
            const result = await a.handler(selectedText)
            logger.info('Action result:', result)
            return { success: true, result }
          } catch (err) {
            logger.error('action handler error', err)
            return { success: false, error: String(err) }
          }
        }
      }
      logger.warn('Action not found:', actionId)
      return { success: false, error: 'Action not found' }
    } catch (error) {
      logger.error('Error executing action:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-suggestions', (_, query: string) => {
    const widgets = widgetManager.getAllWidgets()
    const items: Array<{ id: string; label: string; type: 'widget' | 'action' }> = []

    widgets.forEach(w => {
      items.push({ id: w.id, label: w.label, type: 'widget' });
      (w.actions ?? []).forEach(a => items.push({ id: a.id, label: a.label, type: 'action' }))
    })

    const q = (query || '').toLowerCase().trim()
    const scored = items.map(item => {
        let score = 0
        const label = item.label.toLowerCase()
        const q = (query || '').toLowerCase().trim()

        if (!q) score = 0
        else if (label.startsWith(q)) score = 100
        else if (label.includes(q)) score = 50

        const usageNum = settingsManager.getUsage(item.id) || 0
        score += Math.min(usageNum, 50)

        return { item, score }
        })

    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => ({ id: s.item.id, label: s.item.label, type: s.item.type }))
  })

  ipcMain.handle('get-preferences', () => settingsManager.getAll())
  ipcMain.handle('set-preferences', (_, prefs: any) => settingsManager.setAll(prefs))

  // In ipc-handlers.ts
  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean) => {
    console.log('[IPC] set-ignore-mouse-events called with:', ignore)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      console.log('[IPC] Setting ignore mouse events on window:', ignore)
      const now = Date.now()
      
      // Store the state and timestamp for blur handler to check
      ;(window as any)._isIgnoringMouseEvents = ignore
      ;(window as any)._lastIgnoreMouseEventsTime = now
      
      // Track when click-through was last active (even after it's disabled)
      // This helps us ignore delayed blur events that fire after click-through is disabled
      if (ignore) {
        // Click-through is being enabled - mark the time
        ;(window as any)._lastClickThroughActiveTime = now
      }
      // When disabling, don't update _lastClickThroughActiveTime
      // This way we can check how long ago click-through was active, even if it's now disabled
      
      window.setIgnoreMouseEvents(ignore, { forward: true })
    } else {
      console.log('[IPC] Window not found!')
    }
  })
}
