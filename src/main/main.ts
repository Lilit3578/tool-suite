// src/main/main.ts
import 'dotenv/config'
import path from 'path'
import { app, BrowserWindow, nativeImage, Tray, Menu, globalShortcut, screen } from 'electron'
import { WidgetManager } from './widget-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { settingsManager } from './settings-manager'
import { createLogger } from './logger'
import { TextTranslator } from './widgets/text-translator'
import { captureSelectedText } from './text-capture'
import { createWindow } from './window-factory'

const logger = createLogger('Main')
let mainWindow: BrowserWindow | null = null
let translatorWindow: BrowserWindow | null = null
let actionPopoverWindow: BrowserWindow | null = null
let tray: Tray | null = null
let capturedText: string = ''
const widgetManager = new WidgetManager()

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  // Use window factory with palette config
  mainWindow = await createWindow({
    widgetId: 'palette',
    props: { capturedText },
  })

  let blurTimeout: NodeJS.Timeout | null = null
  const CLICK_THROUGH_DEBOUNCE = 50 // Very short debounce - only ignore blur from rapid mouse movements

  // CRITICAL: Set up blur handler AFTER window is created
  // Remove any existing blur handlers first (window factory might have added one)
  mainWindow.removeAllListeners('blur')
  mainWindow.removeAllListeners('focus')

  // Blur handler - hide both palette and popover when clicking outside
  // Only ignore blur if click-through is CURRENTLY active AND it was just enabled
  // This allows clicks in transparent areas to immediately hide the window
  mainWindow.on('blur', () => {
    // Read state from window object (set by IPC handler)
    const isIgnoringMouseEvents = (mainWindow as any)?._isIgnoringMouseEvents || false
    const lastIgnoreMouseEventsTime = (mainWindow as any)?._lastIgnoreMouseEventsTime || 0
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
      const currentIsIgnoring = (mainWindow as any)?._isIgnoringMouseEvents || false
      const currentLastTime = (mainWindow as any)?._lastIgnoreMouseEventsTime || 0
      const timeSinceChange = Date.now() - currentLastTime
      
      if (currentIsIgnoring && timeSinceChange < CLICK_THROUGH_DEBOUNCE) {
        logger.info('Blur timeout cancelled (rapid mouse movement)')
        blurTimeout = null
        return
      }
      
      // Check if window regained focus (user clicked back on it)
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
        logger.info('Blur timeout cancelled (window regained focus)')
        blurTimeout = null
        return
      }
      
      logger.info('Blur timeout executing - hiding windows immediately')
      
      // Hide palette
      if (mainWindow && !mainWindow.isDestroyed()) {
        logger.info('Hiding palette window')
        mainWindow.hide()
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
  mainWindow.on('focus', () => {
    logger.info('Palette focus event fired')
    if (blurTimeout) {
      logger.info('Cancelling blur timeout')
      clearTimeout(blurTimeout)
      blurTimeout = null
    }
    // Reset click-through state tracking when window regains focus
    if (mainWindow) {
      (mainWindow as any)._isIgnoringMouseEvents = false
    }
  })

  mainWindow.on('closed', () => { 
    mainWindow = null 
    if (blurTimeout) {
      clearTimeout(blurTimeout)
      blurTimeout = null
    }
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
    const isIgnoringMouseEvents = (popoverWindow as any)?._isIgnoringMouseEvents || false
    const lastIgnoreMouseEventsTime = (popoverWindow as any)?._lastIgnoreMouseEventsTime || 0
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
      const currentIsIgnoring = (popoverWindow as any)?._isIgnoringMouseEvents || false
      const currentLastTime = (popoverWindow as any)?._lastIgnoreMouseEventsTime || 0
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
  settingsManager.init({ translatorDefaultTarget: 'it' })

  // Hide dock icon on macOS to make it feel like a utility
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  widgetManager.registerWidget(new TextTranslator(widgetManager))

  registerIpcHandlers(widgetManager, {
    getCapturedText: () => capturedText,
    openTranslatorWidget: async (selectedText: string) => {
      logger.info('openTranslatorWidget called with text:', selectedText || capturedText)
      try {
        // Remove blur handler before opening translator
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.removeAllListeners('blur')
          logger.info('Removed main window blur handler')
        }
        
        // Create translator window
        const win = await createTranslatorWindow(selectedText || capturedText)
        logger.info('Translator window created/shown')
        
        // Hide the palette
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
    
    // Capture selected text silently before showing window
    capturedText = await captureSelectedText()
    logger.info(`Captured text: "${capturedText}"`)
    
    // Get mouse position before showing window
    const { x, y } = screen.getCursorScreenPoint()
    
    const win = await createMainWindow()
    // Set position and then show
    win.setPosition(x, y, false)
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