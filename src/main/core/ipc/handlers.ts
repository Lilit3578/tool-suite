// src/main/core/ipc/handlers.ts
import { ipcMain, BrowserWindow } from 'electron'
import type { WidgetManager } from '../../widgets/widget-manager'
import type { WidgetAction } from '../../types'
import { createLogger } from '../../utils/logger'
import { settingsManager } from '../settings/settings-manager'

const logger = createLogger('IPC')

// Type for cached searchable items
type SearchableItem = {
  id: string
  label: string
  keywords: string[]
  tags: string[]
  type: 'widget' | 'action'
}

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
// Cached widget/action list for search
let cachedWidgetList: SearchableItem[] = []
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
        cachedWidgetList.push({
          id: w.id,
          label: w.label,
          keywords: w.keywords || [],
          tags: w.tags || [],
          type: 'widget'
        });
        (w.actions ?? []).forEach((a: WidgetAction) => cachedWidgetList.push({
          id: a.id,
          label: a.label,
          keywords: a.keywords || [],
          tags: a.tags || [],
          type: 'action'
        }))
      })

      logger.debug(`Built widget list cache: ${cachedWidgetList.length} items`)
    }

    // Normalize query: trim whitespace and lowercase
    const q = (query || '').trim().toLowerCase()

    // If no query, return all items sorted by usage (for suggested section)
    // The UI will handle alphabetical sorting for widgets/actions sections
    if (!q) {
      const scored = cachedWidgetList.map(item => ({
        item,
        score: settingsManager.getUsage(item.id) || 0
      }))
      scored.sort((a: any, b: any) => b.score - a.score)
      const elapsed = Date.now() - startTime
      logger.debug(`get - suggestions(no query) took ${elapsed} ms`)
      return scored.map((s: any) => ({ id: s.item.id, label: s.item.label, type: s.item.type }))
    }

    // Create or reuse Fuse.js instance with improved multi-field config
    if (!cachedFuseInstance) {
      const Fuse = require('fuse.js')
      cachedFuseInstance = new Fuse(cachedWidgetList, {
        keys: [
          { name: 'label', weight: 0.4 },      // Primary: action/widget label
          { name: 'keywords', weight: 0.3 },   // Secondary: searchable keywords
          { name: 'tags', weight: 0.2 },       // Tertiary: categories
          { name: 'id', weight: 0.1 }          // Fallback: ID
        ],
        threshold: 0.3,           // Stricter threshold for better relevance (was 0.5)
        includeScore: true,
        ignoreLocation: true,     // Match anywhere in the string
        minMatchCharLength: 1,
        distance: 1000,           // Increased from 100 for better multi-word matching
        findAllMatches: true,     // Find all matching patterns
        useExtendedSearch: false, // Keep false for simple fuzzy matching
      })
      logger.debug('Created Fuse.js instance with multi-field search (label, keywords, tags, id)')
    }

    const fuseResults = cachedFuseInstance.search(q)
    logger.debug(`[SEARCH DEBUG] Query: "${q}" - Fuse.js returned ${fuseResults.length} raw results`)
    if (fuseResults.length > 0 && fuseResults.length <= 5) {
      logger.debug('[SEARCH DEBUG] First few Fuse results:', fuseResults.slice(0, 5).map((r: any) => ({
        id: r.item.id,
        label: r.item.label,
        type: r.item.type,
        fuseScore: r.score
      })))
    }

    // Improved scoring with multiple bonus types
    const usageCache = new Map<string, number>()

    const scored = fuseResults.map((result: any) => {
      const item = result.item
      const labelLower = item.label.toLowerCase()
      const keywordsLower = (item.keywords || []).map((k: string) => k.toLowerCase())

      // Fuse score is 0 (perfect) to 1 (poor), invert it to 0-70
      const fuzzyScore = (1 - (result.score || 0)) * 70

      // Cache usage lookups (capped at 30)
      let usageScore = usageCache.get(item.id)
      if (usageScore === undefined) {
        usageScore = Math.min(settingsManager.getUsage(item.id) || 0, 30)
        usageCache.set(item.id, usageScore)
      }

      // Exact match bonus: +50 points (label matches query exactly)
      const exactMatchBonus = labelLower === q ? 50 : 0

      // Prefix match bonus: +25 points (label starts with query)
      const prefixMatchBonus = labelLower.startsWith(q) && labelLower !== q ? 25 : 0

      // Keyword exact match bonus: +40 points (query matches any keyword exactly)
      const keywordExactBonus = keywordsLower.includes(q) ? 40 : 0

      // Word-start match bonus: +30 points (query matches start of any word in label)
      const words = labelLower.split(/\s+/)
      const wordStartBonus = words.some((word: string) => word.startsWith(q) && word !== q) ? 30 : 0

      const totalScore = fuzzyScore + usageScore + exactMatchBonus + prefixMatchBonus + keywordExactBonus + wordStartBonus

      return {
        item,
        score: totalScore,
        fuzzyScore,
        usageScore,
        exactMatchBonus,
        prefixMatchBonus,
        keywordExactBonus,
        wordStartBonus
      }
    })

    // Filter out weak matches: only keep results with meaningful relevance
    // Minimum score of 40 ensures at least some match quality
    // (fuzzyScore max 70 + bonuses, so 40 = ~57% fuzzy match or lower with bonuses)
    const MIN_SCORE = 40
    const filtered = scored.filter((s: any) => s.score >= MIN_SCORE)

    logger.debug(`[SEARCH DEBUG] Filtered ${scored.length} scored results -> ${filtered.length} above threshold (min score: ${MIN_SCORE})`)

    filtered.sort((a: any, b: any) => b.score - a.score)

    const elapsed = Date.now() - startTime
    const finalResults = filtered.map((s: any) => ({ id: s.item.id, label: s.item.label, type: s.item.type }))

    logger.debug(`[SEARCH DEBUG] Query: "${q}" - Final results count: ${finalResults.length}`)
    if (finalResults.length > 0 && finalResults.length <= 10) {
      logger.debug('[SEARCH DEBUG] Final results being sent to frontend:', finalResults)
    } else if (finalResults.length > 10) {
      logger.debug('[SEARCH DEBUG] First 10 final results:', finalResults.slice(0, 10))
    }
    logger.debug(`get - suggestions("${q}") took ${elapsed} ms, ${fuseResults.length} Fuse results -> ${filtered.length} filtered -> ${finalResults.length} final results`)

    return finalResults
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
      logger.debug(`Resized window to height: ${height} `)
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
