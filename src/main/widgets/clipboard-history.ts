// src/main/widgets/clipboard-history-widget.ts
import { Widget } from '../types'
import type { WidgetManager } from './widget-manager'
import type { ClipboardManager } from '../core/clipboard/clipboard-manager'
import { createLogger } from '../utils/logger'

const logger = createLogger('ClipboardHistoryWidget')

export class ClipboardHistoryWidget implements Widget {
    id = 'clipboard-history'
    label = 'Clipboard History'
    icon = '📋'
    componentType = 'clipboard-history'

    // Window configuration - matches window-registry.ts
    windowOptions = {
        width: 550,  // Match command palette width
        height: 400,
        transparent: false,
        backgroundColor: '#ffffff',
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        blurDelay: 0  // Immediate hide on blur
    }

    // No actions - selection triggers paste directly
    actions = []

    constructor(
        private widgetManager: WidgetManager,
        private clipboardManager: ClipboardManager
    ) { }

    async initialize() {
        logger.info('ClipboardHistoryWidget initialized')
    }

    async show() {
        // Return 5 most recent items for display
        const items = this.clipboardManager.getRecentItems(5)
        logger.info(`Showing ${items.length} recent clipboard items`)
        return { items }
    }
}
