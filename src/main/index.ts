// src/main/index.ts
import 'dotenv/config'
import path from 'path'
import { app, BrowserWindow, nativeImage, Tray, Menu, globalShortcut, screen, dialog } from 'electron'
import { WidgetManager } from './widgets/widget-manager'
import { registerIpcHandlers } from './core/ipc/handlers'
import { settingsManager } from './core/settings/settings-manager'
import { createLogger } from './utils/logger'
import { TextTranslator } from './widgets/text-translator'
import { CurrencyConverter } from './widgets/currency-converter'
import { captureSelectedText } from './utils/text-capture'
import { createWindow } from './core/window/factory'
import { ClipboardManager } from './core/clipboard/clipboard-manager'
import { ClipboardHistoryWidget } from './widgets/clipboard-history'

const logger = createLogger('Main')

// Interface for window with custom state properties
interface WindowWithState extends BrowserWindow {
  _isIgnoringMouseEvents?: boolean
  _lastIgnoreMouseEventsTime?: number
  _lastClickThroughActiveTime?: number
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error)
  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n${error.message}\n\nThe application will continue running, but you may want to restart it.`
  )
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason)
})

// Environment variable validation
function validateEnvironment(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []

  // Optional but recommended API keys
  if (!process.env.EXCHANGE_RATE_API_KEY) {
    warnings.push('EXCHANGE_RATE_API_KEY not set - currency conversion will not work')
  }

  return { valid: true, warnings }
}

let mainWindow: BrowserWindow | null = null
let translatorWindow: BrowserWindow | null = null
let actionPopoverWindow: BrowserWindow | null = null
let tray: Tray | null = null
let capturedText: string = ''
const widgetManager = new WidgetManager()
const clipboardManager = new ClipboardManager()

// Blur handler setup function - can be called multiple times to re-establish handlers
function setupPaletteBlurHandler(window: BrowserWindow) {
  let blurTimeout: NodeJS.Timeout | null = null
  const CLICK_THROUGH_DEBOUNCE = 50 // Very short debounce - only ignore blur from rapid mouse movements

  // Remove any existing blur handlers first
  window.removeAllListeners('blur')
  window.removeAllListeners('focus')

  // Blur handler - hide both palette and popover when clicking outside
  // Only ignore blur if click-through is CURRENTLY active AND it was just enabled
  // This allows clicks in transparent areas to immediately hide the window
  window.on('blur', () => {
    // Read state from window object (set by IPC handler)
    const win = window as WindowWithState
    const isIgnoringMouseEvents = win._isIgnoringMouseEvents || false
    const lastIgnoreMouseEventsTime = win._lastIgnoreMouseEventsTime || 0
    const timeSinceStateChange = Date.now() - lastIgnoreMouseEventsTime

    // Only ignore blur if:
    // 1. Click-through is currently active (mouse is over transparent area)
    // 2. AND it was just enabled very recently (within 50ms)
    // This prevents hiding from rapid mouse movements, but allows clicks to work
    if (isIgnoringMouseEvents && timeSinceStateChange < CLICK_THROUGH_DEBOUNCE) {
      logger.info('Palette blur event ignored (rapid mouse movement over transparent area)', {
        isIgnoringMouseEvents,
        timeSinceStateChange
      })
      return
    }

    // If click-through is active but it's been more than 50ms, treat as a real click
    // This allows users to click in transparent areas to dismiss the window
    logger.info('Palette blur event fired (treating as real blur/click)', {
      isIgnoringMouseEvents,
      timeSinceStateChange
    })

    // Clear any existing timeout
    if (blurTimeout) {
      clearTimeout(blurTimeout)
    }

    // Shorter timeout for immediate response to clicks
    blurTimeout = setTimeout(() => {
      // Double-check: only cancel if click-through was just enabled (rapid movement)
      const win = window as WindowWithState
      const currentIsIgnoring = win._isIgnoringMouseEvents || false
      const currentLastTime = win._lastIgnoreMouseEventsTime || 0
      const timeSinceChange = Date.now() - currentLastTime

      if (currentIsIgnoring && timeSinceChange < CLICK_THROUGH_DEBOUNCE) {
        logger.info('Blur timeout cancelled (rapid mouse movement)')
        blurTimeout = null
        return
      }

      // Check if window regained focus (user clicked back on it)
      if (window && !window.isDestroyed() && window.isFocused()) {
        logger.info('Blur timeout cancelled (window regained focus)')
        blurTimeout = null
        return
      }

      logger.info('Blur timeout executing - hiding windows immediately')

      // Hide palette
      if (window && !window.isDestroyed()) {
        logger.info('Hiding palette window')
        window.hide()
      }

      // Hide popover if it exists
      if (actionPopoverWindow && !actionPopoverWindow.isDestroyed()) {
        logger.info('Hiding action popover window')
        actionPopoverWindow.hide()
      }

      blurTimeout = null
    }, 100) // Reduced from 200ms for faster response
  })

  // Cancel blur timeout if palette regains focus
  window.on('focus', () => {
    logger.info('Palette focus event fired')
    if (blurTimeout) {
      logger.info('Cancelling blur timeout')
      clearTimeout(blurTimeout)
      blurTimeout = null
    }
    // Reset click-through state tracking when window regains focus
    const win = window as WindowWithState
    win._isIgnoringMouseEvents = false
  })

  // Clean up timeout on close
  window.on('closed', () => {
    if (blurTimeout) {
      clearTimeout(blurTimeout)
      blurTimeout = null
    }
  })
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  // Use window factory with palette config
  mainWindow = await createWindow({
    widgetId: 'palette',
    props: { capturedText },
  })

  // Set up blur handler
  setupPaletteBlurHandler(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

async function createTranslatorWindow(selectedText: string) {
  const widget = widgetManager.getWidget('translator')

  if (translatorWindow && !translatorWindow.isDestroyed()) {
    // Position at cursor
    const { x, y } = screen.getCursorScreenPoint()
    translatorWindow.setPosition(x, y, false)
    translatorWindow.show()
    translatorWindow.focus()
    // Update with new props
    translatorWindow.webContents.send('component-init', {
      type: 'translator',
      props: { selectedText },
    })
    return translatorWindow
  }

  // Position at cursor before creating window
  const { x, y } = screen.getCursorScreenPoint()

  // Use window factory
  translatorWindow = await createWindow({
    widgetId: 'translator',
    widget,
    position: { x, y },
    props: { selectedText },
  })

  translatorWindow.on('closed', () => {
    translatorWindow = null
  })

  return translatorWindow
}

async function createActionPopoverWindow(resultText: string, position: { x: number; y: number }) {
  logger.info('createActionPopoverWindow called')
  logger.info('resultText:', resultText, 'type:', typeof resultText)
  logger.info('position:', position)

  // Normalize resultText
  let text = typeof resultText === 'string' ? resultText : String(resultText)

  // Extract error from JSON if needed
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') {
        if (parsed.success === false && parsed.error) {
          text = `Error: ${parsed.error}`
        } else if (parsed.success === true && parsed.result) {
          text = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result)
        }
      }
    } catch (e) {
      // Use as-is
    }
  }

  logger.info('Normalized text:', text)

  // Ensure position coordinates are integers
  const pos = {
    x: Math.round(position.x),
    y: Math.round(position.y)
  }

  // Reuse existing window if available
  if (actionPopoverWindow && !actionPopoverWindow.isDestroyed()) {
    logger.info('Reusing existing action popover window')

    // Update position and content
    actionPopoverWindow.setPosition(pos.x, pos.y)
    actionPopoverWindow.webContents.send('component-init', {
      type: 'action-popover',
      props: { resultText: text },
    })

    // Show without focusing (keep palette focused)
    actionPopoverWindow.showInactive()

    // Override blur handler to also hide main window
    setupActionPopoverBlurHandler(actionPopoverWindow)

    logger.info('Action popover window updated and shown at:', pos)
    return actionPopoverWindow
  }

  // Create new window
  logger.info('Creating new action popover window')

  actionPopoverWindow = await createWindow({
    widgetId: 'action-popover',
    position: pos,
    props: { resultText: text },
  })

  // Override blur handler to also hide main window
  setupActionPopoverBlurHandler(actionPopoverWindow)

  // Clean up on close
  actionPopoverWindow.on('closed', () => {
    actionPopoverWindow = null
  })

  logger.info('Action popover window created at:', pos)
  return actionPopoverWindow
}

// Helper function to set up blur handler for action popover that also hides main window
function setupActionPopoverBlurHandler(popoverWindow: BrowserWindow) {
  const CLICK_THROUGH_DEBOUNCE = 50 // Same as main window

  // Remove any existing blur handlers from window factory
  popoverWindow.removeAllListeners('blur')
  popoverWindow.removeAllListeners('focus')

  let popoverBlurTimeout: NodeJS.Timeout | null = null

  popoverWindow.on('blur', () => {
    // Read state from window object (set by IPC handler)
    const win = popoverWindow as WindowWithState
    const isIgnoringMouseEvents = win._isIgnoringMouseEvents || false
    const lastIgnoreMouseEventsTime = win._lastIgnoreMouseEventsTime || 0
    const timeSinceStateChange = Date.now() - lastIgnoreMouseEventsTime

    // Only ignore blur if click-through was just enabled (rapid mouse movement)
    if (isIgnoringMouseEvents && timeSinceStateChange < CLICK_THROUGH_DEBOUNCE) {
      logger.info('Action popover blur event ignored (rapid mouse movement)', {
        isIgnoringMouseEvents,
        timeSinceStateChange
      })
      return
    }

    logger.info('Action popover blur event fired (treating as real blur/click)', {
      isIgnoringMouseEvents,
      timeSinceStateChange
    })

    // Clear any existing timeout
    if (popoverBlurTimeout) {
      clearTimeout(popoverBlurTimeout)
    }

    // Shorter timeout for immediate response to clicks
    popoverBlurTimeout = setTimeout(() => {
      // Double-check: only cancel if click-through was just enabled (rapid movement)
      const win = popoverWindow as WindowWithState
      const currentIsIgnoring = win._isIgnoringMouseEvents || false
      const currentLastTime = win._lastIgnoreMouseEventsTime || 0
      const timeSinceChange = Date.now() - currentLastTime

      if (currentIsIgnoring && timeSinceChange < CLICK_THROUGH_DEBOUNCE) {
        logger.info('Action popover blur timeout cancelled (rapid mouse movement)')
        popoverBlurTimeout = null
        return
      }

      // Check if window regained focus
      if (popoverWindow && !popoverWindow.isDestroyed() && popoverWindow.isFocused()) {
        logger.info('Action popover blur timeout cancelled (window regained focus)')
        popoverBlurTimeout = null
        return
      }

      logger.info('Action popover blur timeout executing - hiding both windows')

      // Hide popover
      if (popoverWindow && !popoverWindow.isDestroyed()) {
        logger.info('Hiding action popover window')
        popoverWindow.hide()
      }

      // Also hide main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        logger.info('Hiding main window (from action popover blur)')
        mainWindow.hide()
      }

      popoverBlurTimeout = null
    }, 100)
  })

  // Cancel blur timeout if popover regains focus
  popoverWindow.on('focus', () => {
    logger.info('Action popover focus event fired')
    if (popoverBlurTimeout) {
      logger.info('Cancelling action popover blur timeout')
      clearTimeout(popoverBlurTimeout)
      popoverBlurTimeout = null
    }
  })
}

function createTray() {
  const size = 16
  const svgIcon = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="1" width="12" height="14" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
    <line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" stroke-width="1.5"/>
    <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.5"/>
    <line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1.5"/>
  </svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgIcon).toString('base64')}`
  const image = nativeImage.createFromDataURL(dataUrl)
  image.setTemplateImage(true)
  tray = new Tray(image)
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Palette',
      click: async () => {
        const { x, y } = screen.getCursorScreenPoint()
        const w = await createMainWindow()
        w.setPosition(x, y, false)
        w.show()
        w.focus()
      }
    },
    { type: 'separator' },
    { label: `Widgets: ${widgetManager.getWidgetCount()}`, enabled: false },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setToolTip('Command Palette')
  tray.setContextMenu(menu)
}

app.on('ready', async () => {
  logger.info('App ready')

  // Validate environment
  const envCheck = validateEnvironment()
  if (envCheck.warnings.length > 0) {
    logger.warn('Environment warnings:', envCheck.warnings)
    // Show warnings but don't block startup
    envCheck.warnings.forEach(warning => logger.warn(warning))
  }

  settingsManager.init({ translatorDefaultTarget: 'it' })

  // Hide dock icon on macOS to make it feel like a utility
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  // Initialize clipboard manager
  clipboardManager.initialize()

  // Register clipboard widget FIRST (appears at top of list)
  widgetManager.registerWidget(new ClipboardHistoryWidget(widgetManager, clipboardManager))

  widgetManager.registerWidget(new TextTranslator(widgetManager))
  widgetManager.registerWidget(new CurrencyConverter(widgetManager))

  registerIpcHandlers(widgetManager, {
    getCapturedText: () => capturedText,
    getClipboardPreview: () => clipboardManager.getClipboardPreview(),
    pasteClipboardItem: (id: string) => clipboardManager.pasteItem(id),
    clearClipboardHistory: () => clipboardManager.clearHistory(),
    openTranslatorWidget: async (selectedText: string) => {
      logger.info('openTranslatorWidget called with text:', selectedText || capturedText)
      try {
        // Create translator window
        const win = await createTranslatorWindow(selectedText || capturedText)
        logger.info('Translator window created/shown')

        // Hide the palette (blur handler will remain active for next time)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide()
          logger.info('Main window hidden after translator opened')
        }

        return win
      } catch (error) {
        logger.error('Error creating translator window:', error)
        throw error
      }
    },
    showActionPopover: async (resultText: string, relativePosition: { x: number; y: number }) => {
      logger.info('=== showActionPopover CALLED ===')
      logger.info('resultText:', resultText)
      logger.info('relativePosition:', relativePosition)

      try {
        // Convert viewport coordinates to screen coordinates
        let screenX = relativePosition.x
        let screenY = relativePosition.y

        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
          const [mainX, mainY] = mainWindow.getPosition()
          logger.info('Palette position:', { mainX, mainY })

          // Add palette window position to relative position
          screenX = Math.round(mainX + relativePosition.x)
          screenY = Math.round(mainY + relativePosition.y)

          logger.info('Screen position:', { screenX, screenY })
        } else {
          logger.warn('Palette window not available, using cursor position')
          const { x, y } = screen.getCursorScreenPoint()
          screenX = x + 20
          screenY = y
        }

        const win = await createActionPopoverWindow(resultText, { x: screenX, y: screenY })
        logger.info('=== showActionPopover SUCCESS ===')
        return win
      } catch (error) {
        logger.error('=== showActionPopover ERROR ===', error)
        throw error
      }
    },
  })

  createTray()

  const shortcut = 'Option+Shift+N'
  globalShortcut.register(shortcut, async () => {
    logger.info('Global shortcut pressed')

    // Capture focused app BEFORE opening palette (for auto-paste)
    await clipboardManager.captureFocusedAppForPaste()

    // Capture selected text silently before showing window
    capturedText = await captureSelectedText()
    logger.info(`Captured text: "${capturedText}"`)

    // Get mouse position and screen bounds
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)

    // Palette dimensions
    const paletteWidth = 270
    const paletteHeight = 328

    // Calculate position with boundary detection
    let windowX = cursor.x
    let windowY = cursor.y

    // Check if palette would go off-screen at the bottom
    const screenBottom = display.bounds.y + display.bounds.height
    const wouldClipBottom = (cursor.y + paletteHeight) > screenBottom

    if (wouldClipBottom) {
      // Position above cursor
      windowY = cursor.y - paletteHeight
      // Ensure we don't go off-screen at the top
      windowY = Math.max(display.bounds.y, windowY)
      logger.info('Palette positioned above cursor (near bottom edge)', { cursor: cursor.y, windowY })
    } else {
      // Normal position at cursor
      logger.info('Palette positioned at cursor (normal)', { cursor: cursor.y, windowY })
    }

    const win = await createMainWindow()
    // Set position and then show
    win.setPosition(windowX, windowY, false)
    // Send component-init with palette type and captured text
    win.webContents.send('component-init', {
      type: 'palette',
      props: { capturedText },
    })
    // Also send legacy event for backward compatibility
    win.webContents.send('palette-opened', { capturedText })
    win.show()
    win.focus()
  })


  app.on('will-quit', () => globalShortcut.unregisterAll())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', async () => { await createMainWindow() })