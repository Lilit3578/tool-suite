// src/main/window-factory.ts
// Unified window creation using window registry and widget configs

import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { createLogger } from './logger'
import { getWindowConfig, getComponentType, WINDOW_REGISTRY } from './window-registry'
import type { Widget } from './types'

const logger = createLogger('WindowFactory')

interface WindowCreationOptions {
  widgetId: string
  widget?: Widget
  position?: { x: number; y: number }
  props?: any // Props to pass to React component
}

export async function createWindow(options: WindowCreationOptions): Promise<BrowserWindow> {
  const { widgetId, widget, position, props = {} } = options
  
  console.log('===== CREATE WINDOW START =====')
  console.log('Widget ID:', widgetId)
  console.log('Widget:', widget)
  console.log('Props:', props)
  
  // Get window configuration
  const windowConfig = getWindowConfig(widgetId, widget?.windowOptions)
  const componentType = widget?.componentType || getComponentType(widgetId)
  
  console.log('Window Config:', windowConfig)
  console.log('Component Type:', componentType)
  console.log('================================')
  
  logger.info(`Creating window for ${widgetId} with component type: ${componentType}`)
  
  // Calculate position
  let windowX = 0
  let windowY = 0
  
  if (position) {
    windowX = position.x
    windowY = position.y
  } else {
    // Default: position at cursor
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    windowX = Math.max(display.bounds.x + 20, cursor.x - Math.round(windowConfig.width / 2))
    windowY = Math.max(display.bounds.y + 40, cursor.y - Math.round(windowConfig.height / 2))
  }
  
  // Create BrowserWindow with config
  const win = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    x: windowX,
    y: windowY,
    show: false, // CRITICAL: Don't show until ready
    frame: windowConfig.frame ?? false,
    transparent: windowConfig.transparent ?? false,
    backgroundColor: windowConfig.backgroundColor,
    alwaysOnTop: windowConfig.alwaysOnTop ?? true,
    resizable: windowConfig.resizable ?? false,
    skipTaskbar: windowConfig.skipTaskbar ?? true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  
  // Load the renderer (same HTML for all windows)
  const url = process.env.ELECTRON_RENDERER_URL ?? 
    `file://${path.join(__dirname, '../renderer/index.html')}`
  
  console.log('Loading URL:', url)
  win.loadURL(url) // Don't await - let it load in background
  
  console.log('===== URL LOAD INITIATED =====')
  
  // Wait for the window to be fully loaded (with timeout)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('===== LOAD TIMEOUT - PROCEEDING ANYWAY =====')
      logger.warn(`Window load timeout for ${widgetId}, proceeding anyway`)
      resolve()
    }, 5000) // 5 second timeout
    
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timeout)
      console.log('===== DID-FINISH-LOAD =====')
      logger.info(`Window loaded for ${widgetId}`)
      resolve()
    })
  })
  
  // Send component-init event ONCE after load
  console.log('===== SENDING COMPONENT-INIT =====')
  console.log('Type:', componentType)
  console.log('Props:', props)
  
  win.webContents.send('component-init', {
    type: componentType,
    props,
  })
  
  // Small delay to ensure React has time to process the init event
  await new Promise(resolve => setTimeout(resolve, 50))
  
  // Now show the window
  console.log('===== SHOWING WINDOW =====')
  
  // Special handling for action-popover
  if (widgetId === 'action-popover') {
    // Show without focusing - keep focus on palette window
    win.showInactive()
    console.log('Window shown inactive (action-popover)')
    
    // Prevent the window from taking focus
    win.setFocusable(false)
    
    // DO NOT auto-hide - let the palette's blur handler control this
  } else {
    // Normal windows - show and focus
    win.show()
    win.focus()
    console.log('Window shown and focused')
  }
  
  logger.info(`Window shown for ${widgetId}`)
  
  // Set up blur handler with delay
  let blurTimer: NodeJS.Timeout | null = null
  const blurDelay = windowConfig.blurDelay ?? 0
  
  // Special handling - don't set up blur handlers for palette or action-popover
  // These are managed in main.ts
  if (widgetId === 'action-popover' || widgetId === 'palette') {
    console.log(`${widgetId}: No blur handler set up here (managed in main.ts)`)
  } else if (blurDelay > 0) {
    // Other windows with blur delay
    win.on('blur', () => {
      if (win && !win.isDestroyed()) {
        blurTimer = setTimeout(() => {
          if (win && !win.isDestroyed()) {
            win.hide()
          }
        }, blurDelay)
      }
    })
    
    win.on('focus', () => {
      if (blurTimer) {
        clearTimeout(blurTimer)
        blurTimer = null
      }
    })
  } else {
    // Immediate hide on blur (for other windows)
    win.on('blur', () => {
      if (win && !win.isDestroyed()) {
        win.hide()
      }
    })
  }
  
  console.log('===== CREATE WINDOW END =====')
  
  return win
}