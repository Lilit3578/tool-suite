// src/main/core/ipc/handlers.ts
import { ipcMain, BrowserWindow } from 'electron'
import type { WidgetManager } from '../../widgets/widget-manager'
import type { WidgetAction } from '../../types'
import { createLogger } from '../../utils/logger'
import { settingsManager } from '../settings/settings-manager'

const logger = createLogger('IPC')

// Type guard for currency converter widget
function hasCurrencyConverter(widget: any): widget is { convertCurrency: (from: string, to: string, amount: number) => Promise<any> } {
  return widget && typeof widget.convertCurrency === 'function'
}

// Interface for window with state tracking
interface WindowWithState extends BrowserWindow {
  _isIgnoringMouseEvents?: boolean
  _lastIgnoreMouseEventsTime?: number
  _lastClickThroughActiveTime?: number
}

interface MainCallbacks {
  getCapturedText: () => string
  getClipboardPreview?: () => any[]
  getClipboardWidgets?: () => any[]
  pasteClipboardItem?: (id: string) => Promise<void>
  clearClipboardHistory?: () => void
  openTranslatorWidget: (selectedText: string) => Promise<BrowserWindow>
  showActionPopover: (resultText: string, position: { x: number; y: number }) => Promise<BrowserWindow>
}

// Performance optimization: Cache Fuse.js instance and widget list
// This eliminates recreation overhead on every keystroke (80-90% faster search)
let cachedFuseInstance: any = null
let cachedWidgetList: Array<{ id: string; label: string; type: 'widget' | 'action' }> = []
let widgetListVersion = 0 // Increment when widgets change to invalidate cache

// Helper to invalidate search cache (call when widgets are registered/unregistered)
export function invalidateSearchCache() {
  cachedFuseInstance = null
  cachedWidgetList = []
  widgetListVersion++
  logger.debug('Search cache invalidated')
}

export function registerIpcHandlers(widgetManager: WidgetManager, callbacks?: MainCallbacks) {
  // Cache widget metadata - rarely changes
  let cachedWidgetMetadata: any[] | null = null

  ipcMain.handle('get-widgets', () => {
    // Return cached metadata if available
    if (cachedWidgetMetadata) {
      return cachedWidgetMetadata
    }

    // Build and cache metadata
    cachedWidgetMetadata = widgetManager.getAllWidgets().map(w => ({
      id: w.id,
      label: w.label,
      icon: w.icon,
      actions: w.actions?.map((a: WidgetAction) => ({ id: a.id, label: a.label })) ?? [],
    }))

    return cachedWidgetMetadata
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
        const a = w.actions?.find((x: WidgetAction) => x.id === actionId)
        if (a && typeof a.handler === 'function') {
          logger.info('Found action handler for:', actionId)
          settingsManager.incrementUsage(actionId)
          try {
            const result = await a.handler(selectedText)
            logger.info('Action result:', result)

            // Check if the handler already returned a {success, result} object
            // If so, return it directly to avoid double-wrapping
            if (result && typeof result === 'object' && 'success' in result) {
              return result
            }

            // Otherwise, wrap it in the standard format
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
    const startTime = Date.now()

    // Build widget list if cache is empty or stale
    if (cachedWidgetList.length === 0) {
      const widgets = widgetManager.getAllWidgets()
      cachedWidgetList = []

      widgets.forEach(w => {
        cachedWidgetList.push({ id: w.id, label: w.label, type: 'widget' });
        (w.actions ?? []).forEach((a: WidgetAction) => cachedWidgetList.push({ id: a.id, label: a.label, type: 'action' }))
      })

      logger.debug(`Built widget list cache: ${cachedWidgetList.length} items`)
    }

    const q = (query || '').toLowerCase().trim()

    // If no query, return all items sorted by usage
    if (!q) {
      const scored = cachedWidgetList.map(item => ({
        item,
        score: settingsManager.getUsage(item.id) || 0
      }))
      scored.sort((a: any, b: any) => b.score - a.score)
      const elapsed = Date.now() - startTime
      logger.debug(`get-suggestions (no query) took ${elapsed}ms`)
      return scored.map((s: any) => ({ id: s.item.id, label: s.item.label, type: s.item.type }))
    }

    // Create or reuse Fuse.js instance
    if (!cachedFuseInstance) {
      const Fuse = require('fuse.js')
      cachedFuseInstance = new Fuse(cachedWidgetList, {
        keys: ['label'],
        threshold: 0.4,
        includeScore: true,
        ignoreLocation: true,
        // Performance optimization: reduce search depth
        minMatchCharLength: 1,
        findAllMatches: false, // Stop at first good match
      })
      logger.debug('Created new Fuse.js instance')
    }

    const fuseResults = cachedFuseInstance.search(q)

    // Optimized scoring: pre-calculate usage scores
    const usageCache = new Map<string, number>()

    const scored = fuseResults.map((result: any) => {
      const item = result.item
      // Fuse score is 0 (perfect) to 1 (poor), invert it to 0-100
      const fuzzyScore = (1 - (result.score || 0)) * 100

      // Cache usage lookups
      let usageScore = usageCache.get(item.id)
      if (usageScore === undefined) {
        usageScore = Math.min(settingsManager.getUsage(item.id) || 0, 50)
        usageCache.set(item.id, usageScore)
      }

      return {
        item,
        score: fuzzyScore + usageScore
      }
    })

    scored.sort((a: any, b: any) => b.score - a.score)

    const elapsed = Date.now() - startTime
    logger.debug(`get-suggestions ("${q}") took ${elapsed}ms, ${fuseResults.length} results`)

    return scored.map((s: any) => ({ id: s.item.id, label: s.item.label, type: s.item.type }))
  })

  ipcMain.handle('get-preferences', () => settingsManager.getAll())
  ipcMain.handle('set-preferences', (_, prefs: any) => settingsManager.setAll(prefs))

  // Clipboard history handlers
  ipcMain.handle('get-clipboard-preview', () => {
    return callbacks?.getClipboardPreview?.() || []
  })

  ipcMain.handle('clear-clipboard-history', () => {
    callbacks?.clearClipboardHistory?.()
    return { success: true }
  })

  // Paste clipboard item handler
  ipcMain.handle('paste-clipboard-item', async (_, id: string) => {
    logger.info('paste-clipboard-item', id)
    try {
      if (callbacks?.pasteClipboardItem) {
        await callbacks.pasteClipboardItem(id)
        return { success: true }
      }
      return { success: false, error: 'Callback not available' }
    } catch (error) {
      logger.error('Error pasting clipboard item:', error)
      return { success: false, error: String(error) }
    }
  })



  // Convert currency handler
  ipcMain.handle('convert-currency', async (_, params: { from: string; to: string; amount: number }) => {
    logger.info('convert-currency', params)
    try {
      const widget = widgetManager.getWidget('currency-converter')
      if (hasCurrencyConverter(widget)) {
        const result = await widget.convertCurrency(params.from, params.to, params.amount)
        return result
      }
      return { success: false, error: 'Currency converter widget not found' }
    } catch (error) {
      logger.error('Error converting currency:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get currency settings handler
  ipcMain.handle('get-currency-settings', () => {
    return {
      defaultFrom: settingsManager.get('currencyDefaultFrom') || 'USD',
      defaultTo: settingsManager.get('currencyDefaultTo') || 'EUR',
    }
  })

  // Save currency settings handler
  ipcMain.handle('save-currency-settings', (_, settings: { defaultFrom?: string; defaultTo?: string }) => {
    if (settings.defaultFrom) {
      settingsManager.set('currencyDefaultFrom', settings.defaultFrom)
    }
    if (settings.defaultTo) {
      settingsManager.set('currencyDefaultTo', settings.defaultTo)
    }
    return { success: true }
  })

  // In ipc-handlers.ts
  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean) => {
    console.log('[IPC] set-ignore-mouse-events called with:', ignore)
    const window = BrowserWindow.fromWebContents(event.sender) as WindowWithState | null
    if (window) {
      console.log('[IPC] Setting ignore mouse events on window:', ignore)
      const now = Date.now()

      // Store the state and timestamp for blur handler to check
      window._isIgnoringMouseEvents = ignore
      window._lastIgnoreMouseEventsTime = now

      // Track when click-through was last active (even after it's disabled)
      // This helps us ignore delayed blur events that fire after click-through is disabled
      if (ignore) {
        // Click-through is being enabled - mark the time
        window._lastClickThroughActiveTime = now
      }
      // When disabling, don't update _lastClickThroughActiveTime
      // This way we can check how long ago click-through was active, even if it's now disabled

      window.setIgnoreMouseEvents(ignore, { forward: true })
    } else {
      console.log('[IPC] Window not found!')
    }
  })

  // Handle window resizing for auto-sizing
  ipcMain.on('resize-window', (event, height: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && !window.isDestroyed()) {
      const [currentWidth] = window.getContentSize()
      window.setContentSize(currentWidth, Math.max(height, 200)) // Minimum 200px
      logger.debug(`Resized window to height: ${height}`)
    }
  })

  // Get window position and screen dimensions for popover positioning
  ipcMain.handle('get-window-position', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) {
      return { windowX: 0, windowY: 0, screenWidth: 1920, screenHeight: 1080 }
    }

    const [windowX, windowY] = window.getPosition()
    const { screen } = require('electron')
    const display = screen.getDisplayNearestPoint({ x: windowX, y: windowY })

    return {
      windowX,
      windowY,
      screenWidth: display.bounds.width,
      screenHeight: display.bounds.height
    }
  })

  // Hide the current window (used by palette to close itself when opening widgets)
  ipcMain.handle('hide-current-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && !window.isDestroyed()) {
      logger.info('Hiding window via IPC request')
      window.hide()
      return { success: true }
    }
    return { success: false, error: 'Window not found' }
  })
}
