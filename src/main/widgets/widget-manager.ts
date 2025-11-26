// src/main/widget-manager.ts
import { BrowserWindow, screen } from 'electron'
import { Widget } from '../types'
import { createLogger } from '../utils/logger'
import { createWindow } from '../core/window/factory'
import { getWindowConfig } from '../core/window/registry'
const logger = createLogger('WidgetManager')

export class WidgetManager {
  private widgets = new Map<string, Widget>()
  private windows = new Map<string, BrowserWindow>()

  registerWidget(widget: Widget) {
    this.widgets.set(widget.id, widget)
    logger.info(`Registered widget: ${widget.id}`)
  }

  getWidget(id: string) {
    return this.widgets.get(id)
  }

  getAllWidgets() {
    return Array.from(this.widgets.values())
  }

  getWidgetCount() {
    return this.widgets.size
  }

  async openWidgetWindow(id: string, payload?: any) {
    const widget = this.widgets.get(id)
    if (!widget) throw new Error(`Widget ${id} not registered`)

    // Call widget's show() method if it exists to get additional props
    let widgetProps = payload || {}
    if (widget.show && typeof widget.show === 'function') {
      try {
        const showResult = await widget.show(payload?.selectedText)
        // Merge show() result with payload
        widgetProps = { ...widgetProps, ...showResult }
      } catch (error) {
        console.error(`Error calling show() on widget ${id}:`, error)
      }
    }

    // Check if window already exists
    if (this.windows.has(id)) {
      const win = this.windows.get(id)!
      if (!win.isDestroyed()) {
        // Reposition at cursor for widgets that should appear at cursor
        // CRITICAL: Use stored display from Command Palette, not cursor display
        if (id === 'clipboard-history' || id === 'currency-converter') {
          const storedDisplay = (global as any).currentPaletteDisplay
          const cursor = screen.getCursorScreenPoint()
          const display = storedDisplay || screen.getDisplayNearestPoint(cursor)
          const windowConfig = getWindowConfig(id, widget.windowOptions)
          const screenRight = display.bounds.x + display.bounds.width
          const screenBottom = display.bounds.y + display.bounds.height

          // Ensure position is within the stored display's bounds
          let windowX = Math.max(display.bounds.x, Math.min(cursor.x, display.bounds.x + display.bounds.width - windowConfig.width))
          let windowY = Math.max(display.bounds.y, Math.min(cursor.y, display.bounds.y + display.bounds.height - windowConfig.height))

          // Check if window would go off the right edge
          if (windowX + windowConfig.width > screenRight) {
            windowX = Math.max(display.bounds.x + 20, screenRight - windowConfig.width)
          }

          // Check if window would go off the bottom edge
          if (windowY + windowConfig.height > screenBottom) {
            windowY = Math.max(display.bounds.y + 40, screenBottom - windowConfig.height)
          }

          // Ensure window doesn't go off the left or top edges
          windowX = Math.max(display.bounds.x + 20, windowX)
          windowY = Math.max(display.bounds.y + 40, windowY)

          win.setPosition(windowX, windowY, false)
        }
        // For translator and currency-converter: Apply space switching fix
        if (id === 'translator' || id === 'currency-converter') {
          logger.info(`[DEBUG ${id.toUpperCase()}] Reusing existing ${id} window`)

          // DEBUG: Log current window state
          const [currentX, currentY] = win.getPosition()
          const isVisible = win.isVisible()
          logger.info(`[DEBUG ${id.toUpperCase()}] Window state BEFORE hide: position=(${currentX}, ${currentY}), visible=${isVisible}`)

          // CRITICAL: Always hide first, then reposition, then show
          // This ensures correct position for both new and reused windows
          if (win.isVisible()) {
            logger.info(`[DEBUG ${id.toUpperCase()}] Window is visible, hiding it first`)
            win.hide()
            const [afterHideX, afterHideY] = win.getPosition()
            logger.info(`[DEBUG ${id.toUpperCase()}] Window state AFTER hide: position=(${afterHideX}, ${afterHideY}), visible=${win.isVisible()}`)
            // Small delay after hiding to ensure macOS processes the hide
            await new Promise(resolve => setTimeout(resolve, 10))
          } else {
            logger.info(`[DEBUG ${id.toUpperCase()}] Window is NOT visible, skipping hide`)
          }

          // CRITICAL: Use the stored display from Command Palette to ensure same space
          // This ensures the widget appears on the same screen/space in full-screen mode
          const storedDisplay = (global as any).currentPaletteDisplay
          const cursor = screen.getCursorScreenPoint()
          const display = storedDisplay || screen.getDisplayNearestPoint(cursor)
          
          if (storedDisplay) {
            logger.info(`[DEBUG ${id.toUpperCase()}] Using stored display from palette: ${display.id}, bounds: ${JSON.stringify(display.bounds)}`)
          } else {
            logger.info(`[DEBUG ${id.toUpperCase()}] No stored display, using cursor display: ${display.id}`)
          }
          
          logger.info(`[DEBUG ${id.toUpperCase()}] Cursor position: (${cursor.x}, ${cursor.y}), Display: ${display.id}`)
          
          // Ensure position is within the stored display's bounds
          const displayX = Math.max(display.bounds.x, Math.min(cursor.x, display.bounds.x + display.bounds.width - 100))
          const displayY = Math.max(display.bounds.y, Math.min(cursor.y, display.bounds.y + display.bounds.height - 100))
          
          logger.info(`[DEBUG ${id.toUpperCase()}] About to set position to (${displayX}, ${displayY})`)
          win.setPosition(displayX, displayY, false)
          const [afterSetX, afterSetY] = win.getPosition()
          logger.info(`[DEBUG ${id.toUpperCase()}] Window position AFTER setPosition: (${afterSetX}, ${afterSetY})`)
          
          // Update cursor references to use display-adjusted coordinates
          const adjustedCursor = { x: displayX, y: displayY }

            // CRITICAL: Force visibleOnAllWorkspaces MULTIPLE times to ensure macOS respects it
            // macOS sometimes ignores the first call, so we call it multiple times with delays
            ; (win as any).setVisibleOnAllWorkspaces(true)
          logger.info(`[DEBUG ${id.toUpperCase()}] First call: Set visibleOnAllWorkspaces to true`)
          await new Promise(resolve => setTimeout(resolve, 20))

            ; (win as any).setVisibleOnAllWorkspaces(true)
          logger.info(`[DEBUG ${id.toUpperCase()}] Second call: Set visibleOnAllWorkspaces to true`)
          await new Promise(resolve => setTimeout(resolve, 20))

          // CRITICAL: Use 'pop-up-menu' level to match WindowFactory and prevent space switching
          win.setAlwaysOnTop(true, 'pop-up-menu', 1)
          logger.info(`[DEBUG ${id.toUpperCase()}] Set alwaysOnTop to pop-up-menu level (SAME AS PALETTE)`)

          // Update with new props
          win.webContents.send('component-init', {
            type: widget.componentType || id,
            props: widgetProps,
          })

          // CRITICAL: Hide the app before showing window to prevent activation
          const { app } = require('electron')
          if (process.platform === 'darwin') {
            app.hide()
            logger.info(`[DEBUG ${id.toUpperCase()}] Hid app before showing window`)
            await new Promise(resolve => setTimeout(resolve, 20))
          }

          // CRITICAL: Use native macOS APIs to ensure window stays on current space
          if (process.platform === 'darwin') {
            try {
              const nativeHandle = win.getNativeWindowHandle()
              if (nativeHandle && nativeHandle.readUInt32LE) {
                const windowPtr = nativeHandle.readUInt32LE(0)
                logger.info(`[DEBUG ${id.toUpperCase()}] Got native window handle: ${windowPtr}`)
                
                // Try to use Electron's internal APIs to set collection behavior
                const collectionBehavior = 1 | 256
                if (typeof (win as any).setCollectionBehavior === 'function') {
                  (win as any).setCollectionBehavior(collectionBehavior)
                  logger.info(`[DEBUG ${id.toUpperCase()}] Set collection behavior via Electron API`)
                }
              }
            } catch (e) {
              logger.warn(`[DEBUG ${id.toUpperCase()}] Could not access native window:`, e)
            }
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
          // macOS may have "remembered" the window's original display, so we need to force it
          const [currentPosX, currentPosY] = win.getPosition()
          const currentDisplay = screen.getDisplayNearestPoint({ x: currentPosX, y: currentPosY })
          const expectedDisplay = storedDisplay || screen.getDisplayNearestPoint(cursor)
          
          // If the window is on a different display than expected, move it first
          if (currentDisplay.id !== expectedDisplay.id) {
            logger.warn(`[DEBUG ${id.toUpperCase()}] Window is on display ${currentDisplay.id}, but should be on ${expectedDisplay.id}. Moving to correct display...`)
            // Move window to the correct display by setting position relative to that display
            win.setPosition(displayX, displayY, false)
            await new Promise(resolve => setTimeout(resolve, 50)) // Give macOS time to process the move
            
            // Verify it moved
            const [afterMoveX, afterMoveY] = win.getPosition()
            const afterMoveDisplay = screen.getDisplayNearestPoint({ x: afterMoveX, y: afterMoveY })
            if (afterMoveDisplay.id !== expectedDisplay.id) {
              logger.warn(`[DEBUG ${id.toUpperCase()}] Window still on wrong display after move. Forcing position again...`)
              // Force position multiple times
              for (let i = 0; i < 3; i++) {
                win.setPosition(displayX, displayY, false)
                await new Promise(resolve => setTimeout(resolve, 30))
              }
            }
          } else {
            // Window is on correct display, just ensure position is correct
            win.setPosition(displayX, displayY, false)
            logger.info(`[DEBUG ${id.toUpperCase()}] Window already on correct display, set position: (${displayX}, ${displayY})`)
          }
          
          // CRITICAL: Set position one more time right before showing to ensure it sticks
          win.setPosition(displayX, displayY, false)
          await new Promise(resolve => setTimeout(resolve, 10))
          logger.info(`[DEBUG ${id.toUpperCase()}] Final position set BEFORE show: (${displayX}, ${displayY})`)
          
          // CRITICAL: Show window with position already set (matching Command Palette behavior)
          logger.info(`[DEBUG ${id.toUpperCase()}] About to show window (inactive)`)
          win.showInactive()
          
          // Immediately hide app again in case showInactive() activated it
          if (process.platform === 'darwin') {
            app.hide()
            logger.info(`[DEBUG ${id.toUpperCase()}] Hid app again after showInactive`)
          }
          
          // Immediately set visibleOnAllWorkspaces again after showing (for extra safety)
          ;(win as any).setVisibleOnAllWorkspaces(true)
          logger.info(`[DEBUG ${id.toUpperCase()}] Set visibleOnAllWorkspaces after showInactive`)
          
          // Verify position is still correct after showing
          const [afterShowX, afterShowY] = win.getPosition()
          logger.info(`[DEBUG ${id.toUpperCase()}] Window position AFTER show: (${afterShowX}, ${afterShowY}), visible=${win.isVisible()}`)
          logger.info(`[DEBUG ${id.toUpperCase()}] Expected position: (${displayX}, ${displayY}), Actual position: (${afterShowX}, ${afterShowY})`)

          // Check if position changed (indicates space switch)
          if (Math.abs(afterShowY - displayY) > 10) {
            logger.warn(`[DEBUG ${id.toUpperCase()}] WARNING: Position changed significantly! This may indicate space switching. Expected Y: ${displayY}, Actual Y: ${afterShowY}, Delta: ${afterShowY - displayY}`)
            
            // If position changed, try to correct it by repositioning multiple times
            logger.info(`[DEBUG ${id.toUpperCase()}] Attempting to correct position...`)
            for (let i = 0; i < 5; i++) {
              win.setPosition(displayX, displayY, false)
              await new Promise(resolve => setTimeout(resolve, 20))
              const [currentX, currentY] = win.getPosition()
              if (Math.abs(currentY - displayY) < 5) {
                logger.info(`[DEBUG ${id.toUpperCase()}] Position corrected after ${i + 1} attempts: (${currentX}, ${currentY})`)
                break
              }
            }
            const [correctedX, correctedY] = win.getPosition()
            logger.info(`[DEBUG ${id.toUpperCase()}] Final position after correction: (${correctedX}, ${correctedY})`)
          } else if (Math.abs(afterShowX - displayX) > 5 || Math.abs(afterShowY - displayY) > 5) {
            // Small correction for minor position changes
            logger.info(`[DEBUG ${id.toUpperCase()}] Minor position change detected, correcting...`)
            win.setPosition(displayX, displayY, false)
            await new Promise(resolve => setTimeout(resolve, 10))
          }

          // DO NOT call focus() - it triggers space switching!
          // The window is already shown and is usable without focus
          logger.info(`[DEBUG ${id.toUpperCase()}] Window shown without focus (prevents space switching)`)
        } else {
          // Normal windows - show and focus immediately
          win.show()
          win.focus()
          // Update with new props
          win.webContents.send('component-init', {
            type: widget.componentType || id,
            props: widgetProps,
          })
        }

        return win
      } else {
        // Window was destroyed, remove from map
        this.windows.delete(id)
      }
    }

    // Get cursor position for widgets that should appear at cursor
    let position: { x: number; y: number } | undefined
    if (id === 'clipboard-history' || id === 'currency-converter') {
      const cursor = screen.getCursorScreenPoint()
      position = { x: cursor.x, y: cursor.y }
    }

    // Use window factory to create new window
    const win = await createWindow({
      widgetId: id,
      widget,
      position,
      props: widgetProps,
    })

    win.on('closed', () => {
      this.windows.delete(id)
    })

    this.windows.set(id, win)

    return win
  }

  closeWidgetWindow(id: string) {
    const win = this.windows.get(id)
    if (win) {
      win.close()
      this.windows.delete(id)
    }
  }

  closeAll() {
    for (const win of this.windows.values()) win.close()
    this.windows.clear()
  }
}
