// src/main/widget-manager.ts
import { BrowserWindow } from 'electron'
import { Widget } from './types'
import { createLogger } from './logger'
import { createWindow } from './window-factory'
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

    // Check if window already exists
    if (this.windows.has(id)) {
      const win = this.windows.get(id)!
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
        // Update with new props
        win.webContents.send('component-init', {
          type: widget.componentType || id,
          props: payload,
        })
        return win
      } else {
        // Window was destroyed, remove from map
        this.windows.delete(id)
      }
    }

    // Use window factory to create new window
    const win = await createWindow({
      widgetId: id,
      widget,
      props: payload,
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
