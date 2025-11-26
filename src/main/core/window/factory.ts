// src/main/window-factory.ts
// Unified window creation using window registry and widget configs

import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { createLogger } from '../../utils/logger'
import { getWindowConfig, getComponentType, WINDOW_REGISTRY } from './registry'
import type { Widget } from '../../types'

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

  // CRITICAL: Use the stored display from when palette was opened FIRST
  // This ensures widgets appear on the same screen/space in full-screen mode
  const storedDisplay = (global as any).currentPaletteDisplay
  
  // Use provided position or default to cursor position
  const cursor = position || screen.getCursorScreenPoint()
  
  // CRITICAL: Determine display BEFORE calculating position
  // If we have a stored display, use it. Otherwise, use the display nearest to cursor
  const display = storedDisplay || screen.getDisplayNearestPoint(cursor)

  if (storedDisplay) {
    logger.info(`[DEBUG ${widgetId.toUpperCase()}] Using stored display from palette: ${display.id}`)
  } else {
    logger.info(`[DEBUG ${widgetId.toUpperCase()}] No stored display, using current: ${display.id}`)
  }

  const screenRight = display.bounds.x + display.bounds.width
  const screenBottom = display.bounds.y + display.bounds.height

  // CRITICAL: Calculate position relative to the CORRECT display
  // If cursor is on a different display, clamp it to the stored display's bounds
  let cursorX = cursor.x
  let cursorY = cursor.y
  
  // Ensure cursor coordinates are within the target display's bounds
  if (storedDisplay) {
    cursorX = Math.max(display.bounds.x, Math.min(cursorX, display.bounds.x + display.bounds.width))
    cursorY = Math.max(display.bounds.y, Math.min(cursorY, display.bounds.y + display.bounds.height))
  }

  // Calculate initial position (centered on cursor, but within correct display)
  windowX = cursorX - Math.round(windowConfig.width / 2)
  windowY = cursorY - Math.round(windowConfig.height / 2)

  // Ensure window stays within screen bounds
  windowX = Math.max(display.bounds.x + 20, Math.min(windowX, screenRight - windowConfig.width - 20))
  windowY = Math.max(display.bounds.y + 40, Math.min(windowY, screenBottom - windowConfig.height - 20))

  // CRITICAL: Get focused window for parenting (ensures widgets appear in same space as focused window)
  // This is the key to making widgets appear in full-screen apps
  // Only use parent for translator and currency-converter widgets (not palette or clipboard-history)
  // CRITICAL: Do NOT parent to Command Palette - widgets should be independent so they don't hide when palette hides
  const shouldUseParent = widgetId === 'translator' || widgetId === 'currency-converter'
  let focusedWindow: BrowserWindow | null = null
  
  if (shouldUseParent) {
    const focused = BrowserWindow.getFocusedWindow()
    
    // CRITICAL: Check if focused window is our Command Palette or any of our app's windows
    // If so, don't use it as parent - widgets should be independent windows
    // We want to parent to EXTERNAL apps (full-screen apps), not our own windows
    if (focused) {
      const focusedTitle = focused.getTitle()
      const allOurWindows = BrowserWindow.getAllWindows()
      const isOurAppWindow = allOurWindows.some(w => w.id === focused.id)
      
      if (isOurAppWindow) {
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Focused window is our app's window (${focusedTitle}), NOT using as parent - widgets must be independent`)
        focusedWindow = null // Don't parent to our own windows - widgets should be independent
      } else {
        // Focused window is an external app (full-screen app) - use it as parent
        focusedWindow = focused
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Focused window is EXTERNAL app: ID=${focusedWindow.id}, visible=${focusedWindow.isVisible()}, title=${focusedWindow.getTitle()}`)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Using external app window as parent to ensure widget appears in same space`)
      }
    } else {
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] No focused window found - widget will be independent (no parent)`)
    }
  }
  
  // CRITICAL: Create window WITHOUT position in constructor
  // macOS assigns windows to spaces based on their creation position
  // By creating without position, then setting visibleOnAllWorkspaces, then positioning,
  // we prevent macOS from assigning it to the wrong space
  logger.info(`[DEBUG ${widgetId.toUpperCase()}] Creating BrowserWindow WITHOUT position (will set after visibleOnAllWorkspaces)`)

  const win = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    // CRITICAL: Don't set x/y in constructor - macOS uses this to assign space
    // We'll set position AFTER visibleOnAllWorkspaces
    show: false, // CRITICAL: Don't show until ready
    parent: focusedWindow || undefined, // CRITICAL: Parent to focused EXTERNAL window (not our app's windows) - only for translator/currency-converter
    modal: false, // Same as Command Palette
    frame: windowConfig.frame ?? false, // Same as Command Palette
    transparent: windowConfig.transparent ?? false,
    backgroundColor: windowConfig.backgroundColor,
    alwaysOnTop: windowConfig.alwaysOnTop ?? true, // Same as Command Palette
    fullscreenable: false, // CRITICAL: Prevent widgets from becoming top-level fullscreen windows
    resizable: windowConfig.resizable ?? false,
    skipTaskbar: windowConfig.skipTaskbar ?? true, // Same as Command Palette
    type: 'panel', // Same window type as Command Palette for consistency
    // REMOVED: visibleOnAllWorkspaces from constructor - set explicitly below instead
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  logger.info(`[DEBUG ${widgetId.toUpperCase()}] BrowserWindow created`)

  // CRITICAL: Set visibleOnAllWorkspaces IMMEDIATELY after creation, BEFORE setting position
  // This must be done before ANY other window operations (position, loading URL, showing, etc.)
  // The constructor option doesn't work reliably on macOS
  // CRITICAL: Use { visibleOnFullScreen: true } option to ensure widgets appear in full-screen spaces
  if (windowConfig.visibleOnAllWorkspaces !== undefined) {
    if (typeof (win as any).setVisibleOnAllWorkspaces === 'function') {
      // Check if the function supports options parameter
      try {
        ;(win as any).setVisibleOnAllWorkspaces(windowConfig.visibleOnAllWorkspaces, { visibleOnFullScreen: true })
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set visibleOnAllWorkspaces to ${windowConfig.visibleOnAllWorkspaces} with visibleOnFullScreen:true (BEFORE position)`)
      } catch (e) {
        // Fallback if options parameter not supported
        ;(win as any).setVisibleOnAllWorkspaces(windowConfig.visibleOnAllWorkspaces)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set visibleOnAllWorkspaces to ${windowConfig.visibleOnAllWorkspaces} (fallback, no options)`)
      }
    } else {
      logger.warn(`[DEBUG ${widgetId.toUpperCase()}] setVisibleOnAllWorkspaces not available`)
    }
    // Small delay to ensure macOS processes this
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  // CRITICAL: NOW set position after visibleOnAllWorkspaces is set
  // This ensures macOS doesn't assign the window to a space based on position
  win.setPosition(windowX, windowY, false)
  logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set position AFTER visibleOnAllWorkspaces: (${windowX}, ${windowY})`)
  await new Promise(resolve => setTimeout(resolve, 10)) // Small delay to ensure position is set

  // CRITICAL: For macOS full-screen support, set collection behavior
  // This allows windows to appear in full-screen app spaces
  if (process.platform === 'darwin') {
    try {
      // Hide window buttons for frameless windows
      if (!windowConfig.frame) {
        win.setWindowButtonVisibility(false)
      }

      // Try to set NSWindowCollectionBehaviorCanJoinAllSpaces
      // This is the key to appearing in full-screen spaces
      // NSWindowCollectionBehaviorCanJoinAllSpaces = 1 << 0 = 1
      // NSWindowCollectionBehaviorFullScreenAuxiliary = 1 << 8 = 256
      const collectionBehavior = 1 | 256 // CanJoinAllSpaces | FullScreenAuxiliary

      if (typeof (win as any).setCollectionBehavior === 'function') {
        (win as any).setCollectionBehavior(collectionBehavior)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set collection behavior to ${collectionBehavior} (CanJoinAllSpaces + FullScreenAuxiliary)`)
      } else {
        logger.warn(`[DEBUG ${widgetId.toUpperCase()}] setCollectionBehavior not available`)
      }
    } catch (e) {
      logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Could not set collection behavior:`, e)
    }
  }

  // CRITICAL: For translator and currency-converter, set visibleOnAllWorkspaces immediately after creation
  // The constructor option may not work reliably, so we explicitly set it here
  if (widgetId === 'translator' || widgetId === 'currency-converter') {
    ; (win as any).setVisibleOnAllWorkspaces(true)
    logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set visibleOnAllWorkspaces immediately after creation`)

    // DEBUG: Log current space and window properties
    try {
      const spaces = (win as any).getSpaces ? (win as any).getSpaces() : 'N/A'
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window spaces after creation: ${JSON.stringify(spaces)}`)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window level: ${(win as any).getLevel ? (win as any).getLevel() : 'N/A'}`)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] visibleOnAllWorkspaces: ${(win as any).isVisibleOnAllWorkspaces ? (win as any).isVisibleOnAllWorkspaces() : 'N/A'}`)
    } catch (e) {
      logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Could not get space info:`, e)
    }
  }

  // Set window level to 'pop-up-menu' for palette to appear above full-screen apps
  // Use higher level than 'floating' to ensure it appears on current space
  if (widgetId === 'palette') {
    win.setAlwaysOnTop(true, 'pop-up-menu', 1)
    logger.info('Set palette window level to pop-up-menu for full-screen support')
  }

  // CRITICAL: Set window level to 'pop-up-menu' for translator and currency-converter
  // This MUST match palette to prevent space switching
  if (widgetId === 'translator' || widgetId === 'currency-converter') {
    // First try setAlwaysOnTop with level
    win.setAlwaysOnTop(true, 'pop-up-menu', 1)
    logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set alwaysOnTop to pop-up-menu level (SAME AS PALETTE)`)

    // CRITICAL: On macOS, also try to set window level directly using NSWindow
    // NSPopUpMenuWindowLevel = 3 (same as 'pop-up-menu')
    try {
      if (process.platform === 'darwin') {
        // Try to access the native window and set level directly
        const nativeWin = (win as any).getNativeWindowHandle ? (win as any).getNativeWindowHandle() : null
        if (nativeWin) {
          logger.info(`[DEBUG ${widgetId.toUpperCase()}] Got native window handle, attempting to set level directly`)
        }

        // Alternative: Use setWindowLevel if available (undocumented but might exist)
        if (typeof (win as any).setWindowLevel === 'function') {
          (win as any).setWindowLevel(3) // NSPopUpMenuWindowLevel
          logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set window level directly to 3 (NSPopUpMenuWindowLevel)`)
        }
      }
    } catch (e) {
      logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Could not set window level directly:`, e)
    }
  }


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
    }, 2000) // Reduced from 5s to 2s - sufficient for most cases

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

  // Auto-size window height ONLY for currency-converter
  // clipboard-history uses fixed dimensions to prevent instability
  if (widgetId === 'currency-converter') {
    try {
      // Reduced delay from 150ms to 100ms - still sufficient for React to render
      await new Promise(resolve => setTimeout(resolve, 100))

      // Get content height from the DOM - measure the actual content area
      const contentHeight = await win.webContents.executeJavaScript(`
        (function() {
          const body = document.body;
          const html = document.documentElement;
          return Math.max(
            body.scrollHeight, body.offsetHeight,
            html.clientHeight, html.scrollHeight, html.offsetHeight
          );
        })()
      `)

      // Currency converter keeps padding
      const newHeight = Math.max(contentHeight + 40, 200)
      win.setContentSize(windowConfig.width, newHeight)
      logger.info(`Auto-sized ${widgetId} window to height: ${newHeight} (content: ${contentHeight}px)`)
    } catch (err) {
      logger.warn(`Failed to auto-size ${widgetId} window:`, err)
      // Fall back to default height
    }
  }

  // Now show the window
  console.log('===== SHOWING WINDOW =====')

  // Special handling for action-popover and palette
  if (widgetId === 'action-popover') {
    // Show without focusing - keep focus on palette window
    win.showInactive()
    console.log('Window shown inactive (action-popover)')

    // Prevent the window from taking focus
    win.setFocusable(false)

    // DO NOT auto-hide - let the palette's blur handler control this
  } else if (widgetId === 'palette') {
    // DON'T show palette here - the shortcut handler will show it after positioning
    // This ensures position is always correct for both new and reused windows
    console.log('Palette window ready (will be shown by shortcut handler)')
  } else {
    // For translator and currency-converter: Apply space switching fix
    if (widgetId === 'translator' || widgetId === 'currency-converter') {
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Creating new ${widgetId} window`)

      // DEBUG: Log window state before showing
      const [beforeShowX, beforeShowY] = win.getPosition()
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window state BEFORE show: position=(${beforeShowX}, ${beforeShowY}), visible=${win.isVisible()}`)

        // CRITICAL: Force visibleOnAllWorkspaces MULTIPLE times to ensure macOS respects it
        // macOS sometimes ignores the first call, so we call it multiple times with delays
        ; (win as any).setVisibleOnAllWorkspaces(true)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] First call: Set visibleOnAllWorkspaces to true`)
      await new Promise(resolve => setTimeout(resolve, 20))

        ; (win as any).setVisibleOnAllWorkspaces(true)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Second call: Set visibleOnAllWorkspaces to true`)
      await new Promise(resolve => setTimeout(resolve, 20))

      // Also ensure alwaysOnTop is set with 'pop-up-menu' level (CRITICAL for space switching fix)
      // Must use same level as palette to prevent space switching
      win.setAlwaysOnTop(true, 'pop-up-menu', 1)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set alwaysOnTop to pop-up-menu level before show (same as palette)`)

      // DEBUG: Log app and window state BEFORE showing
      try {
        const { app } = require('electron')
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] App state BEFORE show: isReady=${app.isReady()}, isHidden=${app.isHidden ? app.isHidden() : 'N/A'}`)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window level BEFORE show: ${(win as any).getLevel ? (win as any).getLevel() : 'N/A'}`)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] visibleOnAllWorkspaces BEFORE show: ${(win as any).isVisibleOnAllWorkspaces ? (win as any).isVisibleOnAllWorkspaces() : 'N/A'}`)
      } catch (e) {
        logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Could not get app state:`, e)
      }

      // CRITICAL: Match Command Palette behavior exactly
      // 1. Set position BEFORE showing (like Command Palette does)
      // 2. Ensure visibleOnAllWorkspaces is set BEFORE showing
      // 3. Use showInactive() to prevent app activation
      
      // CRITICAL: Set visibleOnAllWorkspaces BEFORE any display checks/moves
      // This must be done first to ensure macOS knows the window should be on all spaces
      ;(win as any).setVisibleOnAllWorkspaces(true)
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // CRITICAL: Ensure window is on the correct display BEFORE showing
      // For new windows, verify which display the position is on
      const { screen } = require('electron')
      const currentDisplay = screen.getDisplayNearestPoint({ x: beforeShowX, y: beforeShowY })
      const storedDisplay = (global as any).currentPaletteDisplay
      const expectedDisplay = storedDisplay || currentDisplay
      
      // If the window position is on a different display than expected, adjust it
      if (currentDisplay.id !== expectedDisplay.id) {
        logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Position is on display ${currentDisplay.id}, but expected ${expectedDisplay.id}. Adjusting...`)
        // Recalculate position relative to expected display
        const cursor = screen.getCursorScreenPoint()
        const adjustedX = cursor.x - Math.round(windowConfig.width / 2)
        const adjustedY = cursor.y - Math.round(windowConfig.height / 2)
        const screenRight = expectedDisplay.bounds.x + expectedDisplay.bounds.width
        const screenBottom = expectedDisplay.bounds.y + expectedDisplay.bounds.height
        const finalX = Math.max(expectedDisplay.bounds.x + 20, Math.min(adjustedX, screenRight - windowConfig.width - 20))
        const finalY = Math.max(expectedDisplay.bounds.y + 40, Math.min(adjustedY, screenBottom - windowConfig.height - 20))
        win.setPosition(finalX, finalY, false)
        await new Promise(resolve => setTimeout(resolve, 50))
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Adjusted position to display ${expectedDisplay.id}: (${finalX}, ${finalY})`)
      } else {
        // Window is on correct display, just ensure position is correct
        win.setPosition(beforeShowX, beforeShowY, false)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window on correct display, set position: (${beforeShowX}, ${beforeShowY})`)
      }
      
      // CRITICAL: Set position one more time right before showing to ensure it sticks
      const [finalPosX, finalPosY] = win.getPosition()
      win.setPosition(finalPosX, finalPosY, false)
      await new Promise(resolve => setTimeout(resolve, 10))
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Final position set BEFORE show: (${finalPosX}, ${finalPosY})`)
      
      // CRITICAL: Hide the app before showing window to prevent activation
      // This ensures macOS doesn't try to activate the app when showing the window
      const { app } = require('electron')
      if (process.platform === 'darwin') {
        app.hide()
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Hid app before showing window`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // CRITICAL: Use native macOS APIs to ensure window stays on current space
      // Try to access the native NSWindow and set collection behavior directly
      if (process.platform === 'darwin') {
        try {
          const nativeHandle = win.getNativeWindowHandle()
          if (nativeHandle && nativeHandle.readUInt32LE) {
            const windowPtr = nativeHandle.readUInt32LE(0)
            logger.info(`[DEBUG ${widgetId.toUpperCase()}] Got native window handle: ${windowPtr}`)
            
            // Try to use Electron's internal APIs to set collection behavior
            // NSWindowCollectionBehaviorCanJoinAllSpaces = 1
            // NSWindowCollectionBehaviorFullScreenAuxiliary = 256
            const collectionBehavior = 1 | 256
            if (typeof (win as any).setCollectionBehavior === 'function') {
              (win as any).setCollectionBehavior(collectionBehavior)
              logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set collection behavior via Electron API`)
            }
          }
        } catch (e) {
          logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Could not access native window:`, e)
        }
      }

      // CRITICAL: Show window with position already set (matching Command Palette behavior)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] About to show window (inactive)`)
      win.showInactive()
      
      // Immediately hide app again in case showInactive() activated it
      if (process.platform === 'darwin') {
        app.hide()
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Hid app again after showInactive`)
      }
      
      // Immediately set visibleOnAllWorkspaces again after showing (for extra safety)
      ;(win as any).setVisibleOnAllWorkspaces(true)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Set visibleOnAllWorkspaces after showInactive`)
      
      // DEBUG: Log app and window state AFTER showing
      try {
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] App state AFTER show: isReady=${app.isReady()}, isHidden=${app.isHidden ? app.isHidden() : 'N/A'}`)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window level AFTER show: ${(win as any).getLevel ? (win as any).getLevel() : 'N/A'}`)
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] visibleOnAllWorkspaces AFTER show: ${(win as any).isVisibleOnAllWorkspaces ? (win as any).isVisibleOnAllWorkspaces() : 'N/A'}`)
        const spaces = (win as any).getSpaces ? (win as any).getSpaces() : 'N/A'
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window spaces AFTER show: ${JSON.stringify(spaces)}`)
      } catch (e) {
        logger.warn(`[DEBUG ${widgetId.toUpperCase()}] Could not get app state after show:`, e)
      }

      // Verify position is still correct after showing
      const [afterShowX, afterShowY] = win.getPosition()
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window position AFTER show: (${afterShowX}, ${afterShowY}), visible=${win.isVisible()}`)
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Expected position: (${beforeShowX}, ${beforeShowY}), Actual position: (${afterShowX}, ${afterShowY})`)

      // Check if position changed (indicates space switch)
      if (Math.abs(afterShowY - beforeShowY) > 10) {
        logger.warn(`[DEBUG ${widgetId.toUpperCase()}] WARNING: Position changed significantly! This may indicate space switching. Delta Y: ${afterShowY - beforeShowY}`)
        
        // If position changed, try to correct it by repositioning multiple times
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Attempting to correct position...`)
        for (let i = 0; i < 5; i++) {
          win.setPosition(beforeShowX, beforeShowY, false)
          await new Promise(resolve => setTimeout(resolve, 20))
          const [currentX, currentY] = win.getPosition()
          if (Math.abs(currentY - beforeShowY) < 5) {
            logger.info(`[DEBUG ${widgetId.toUpperCase()}] Position corrected after ${i + 1} attempts: (${currentX}, ${currentY})`)
            break
          }
        }
        const [correctedX, correctedY] = win.getPosition()
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Final position after correction: (${correctedX}, ${correctedY})`)
      } else if (Math.abs(afterShowX - beforeShowX) > 5 || Math.abs(afterShowY - beforeShowY) > 5) {
        // Small correction for minor position changes
        logger.info(`[DEBUG ${widgetId.toUpperCase()}] Minor position change detected, correcting...`)
        win.setPosition(beforeShowX, beforeShowY, false)
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // DO NOT call focus() - it triggers space switching!
      // The window is already shown and is usable without focus
      logger.info(`[DEBUG ${widgetId.toUpperCase()}] Window shown without focus (prevents space switching)`)
    } else {
      // Normal windows - show and focus
      win.show()
      win.focus()
      console.log('Window shown and focused')
    }
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