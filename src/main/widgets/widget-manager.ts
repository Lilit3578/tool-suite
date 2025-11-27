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

          // CRITICAL: Set visibleOnAllWorkspaces once with options (more reliable than multiple calls)
          try {
            ; (win as any).setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            logger.info(`[DEBUG ${id.toUpperCase()}] Set visibleOnAllWorkspaces with fullScreen option`)
          } catch (e) {
            ; (win as any).setVisibleOnAllWorkspaces(true)
            logger.info(`[DEBUG ${id.toUpperCase()}] Set visibleOnAllWorkspaces (fallback)`)
          }
          // Single delay (reduced from 2x 20ms = 40ms to 30ms)
          await new Promise(resolve => setTimeout(resolve, 30))

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
            // Reduced delay - app.hide() is synchronous
            await new Promise(resolve => setTimeout(resolve, 10))
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

          // CRITICAL: Batch window operations to reduce delays
          // Set visibleOnAllWorkspaces and position together, then verify once
          try {
            ; (win as any).setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
          } catch (e) {
            ; (win as any).setVisibleOnAllWorkspaces(true)
          }

          // Set position and verify display in one pass
          win.setPosition(displayX, displayY, false)
          const [currentPosX, currentPosY] = win.getPosition()
          const currentDisplay = screen.getDisplayNearestPoint({ x: currentPosX, y: currentPosY })
          const expectedDisplay = storedDisplay || screen.getDisplayNearestPoint(cursor)

          // Only correct if on wrong display (reduced from multiple verification loops)
          if (currentDisplay.id !== expectedDisplay.id) {
            logger.warn(`[DEBUG ${id.toUpperCase()}] Window on wrong display ${currentDisplay.id}, correcting to ${expectedDisplay.id}`)
            win.setPosition(displayX, displayY, false)
            // Single delay for display correction (reduced from 50ms + 3x 30ms = 140ms to 40ms)
            await new Promise(resolve => setTimeout(resolve, 40))
          }

          logger.info(`[DEBUG ${id.toUpperCase()}] Position set: (${displayX}, ${displayY})`)

          // CRITICAL: Show window with position already set (matching Command Palette behavior)
          logger.info(`[DEBUG ${id.toUpperCase()}] About to show window (inactive)`)
          win.showInactive()

          // Immediately hide app again in case showInactive() activated it
          if (process.platform === 'darwin') {
            app.hide()
            logger.info(`[DEBUG ${id.toUpperCase()}] Hid app again after showInactive`)
          }

          // Immediately set visibleOnAllWorkspaces again after showing (for extra safety)
          ; (win as any).setVisibleOnAllWorkspaces(true)
          logger.info(`[DEBUG ${id.toUpperCase()}] Set visibleOnAllWorkspaces after showInactive`)

          // Verify position is still correct after showing
          const [afterShowX, afterShowY] = win.getPosition()
          logger.info(`[DEBUG ${id.toUpperCase()}] Window position AFTER show: (${afterShowX}, ${afterShowY}), visible=${win.isVisible()}`)
          logger.info(`[DEBUG ${id.toUpperCase()}] Expected position: (${displayX}, ${displayY}), Actual position: (${afterShowX}, ${afterShowY})`)

          // Verify position with tolerance (reduced from 5 attempts to single check)
          const positionTolerance = 10
          if (Math.abs(afterShowX - displayX) > positionTolerance || Math.abs(afterShowY - displayY) > positionTolerance) {
            logger.warn(`[DEBUG ${id.toUpperCase()}] Position off by (${afterShowX - displayX}, ${afterShowY - displayY}), correcting...`)
            win.setPosition(displayX, displayY, false)
            // Single correction attempt (reduced from 5x 20ms = 100ms to 30ms)
            await new Promise(resolve => setTimeout(resolve, 30))
          }

          // Focus window after a short delay to ensure it's fully shown
          // This prevents space switching while still giving the window focus
          setTimeout(() => {
            if (!win.isDestroyed() && win.isVisible()) {
              win.focus()
              logger.info(`[DEBUG ${id.toUpperCase()}] Window focused after delay`)
            }
          }, 100)
          logger.info(`[DEBUG ${id.toUpperCase()}] Window shown, will focus after delay`)
        } else {
          // Normal windows - show and focus immediately
          win.show()
          // Focus after a short delay to ensure window is ready
          setTimeout(() => {
            if (!win.isDestroyed() && win.isVisible()) {
              win.focus()
            }
          }, 50)
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
      // Clean up all listeners before removing from map
      if (win && !win.isDestroyed()) {
        win.removeAllListeners()
      }
      this.windows.delete(id)
    })

    this.windows.set(id, win)

    return win
  }

  closeWidgetWindow(id: string) {
    const win = this.windows.get(id)
    if (win) {
      if (!win.isDestroyed()) {
        win.removeAllListeners()
        win.close()
      }
      this.windows.delete(id)
    }
  }

  /**
   * Close clipboard history window immediately
   * Used by IPC handler to close window before paste operation
   * Returns true if window was found and closed, false otherwise
   */
  closeClipboardHistoryWindow(): boolean {
    const win = this.windows.get('clipboard-history')
    if (win && !win.isDestroyed()) {
      logger.info('Closing clipboard history window for paste operation')
      win.close()
      this.windows.delete('clipboard-history')
      return true
    }
    logger.warn('Clipboard history window not found or already destroyed')
    return false
  }

  closeAll() {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.removeAllListeners()
        win.destroy()
      }
    }
    this.windows.clear()
  }
}
