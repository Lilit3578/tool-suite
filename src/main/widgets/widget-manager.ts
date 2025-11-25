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
        if (id === 'clipboard-history' || id === 'currency-converter') {
          const cursor = screen.getCursorScreenPoint()
          const display = screen.getDisplayNearestPoint(cursor)
          const windowConfig = getWindowConfig(id, widget.windowOptions)
          const screenRight = display.bounds.x + display.bounds.width
          const screenBottom = display.bounds.y + display.bounds.height

          let windowX = cursor.x
          let windowY = cursor.y

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
        win.show()
        win.focus()
        // Update with new props
        win.webContents.send('component-init', {
          type: widget.componentType || id,
          props: widgetProps,
        })

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
