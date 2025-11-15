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

  // CRITICAL: Set up blur handler AFTER window is created
  // Remove any existing blur handlers first (window factory might have added one)
  mainWindow.removeAllListeners('blur')
  mainWindow.removeAllListeners('focus')

  // Blur handler - hide both palette and popover when clicking outside
  mainWindow.on('blur', () => {
    logger.info('Palette blur event fired')
    
    // Clear any existing timeout
    if (blurTimeout) {
      clearTimeout(blurTimeout)
    }
    
    // Wait a bit to see if popover is being shown
    blurTimeout = setTimeout(() => {
      logger.info('Blur timeout executing - hiding windows')
      
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
    }, 200)
  })

  // Cancel blur timeout if palette regains focus
  mainWindow.on('focus', () => {
    logger.info('Palette focus event fired')
    if (blurTimeout) {
      logger.info('Cancelling blur timeout')
      clearTimeout(blurTimeout)
      blurTimeout = null
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
  
  // Clean up on close
  actionPopoverWindow.on('closed', () => { 
    actionPopoverWindow = null
  })
  
  logger.info('Action popover window created at:', pos)
  return actionPopoverWindow
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