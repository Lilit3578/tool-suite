// src/main/clipboard-manager.ts
import { clipboard, NativeImage, Tray, Menu, Notification, app } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { createLogger } from '../../utils/logger'
import { settingsManager } from '../settings/settings-manager'

const execAsync = promisify(exec)
const logger = createLogger('ClipboardManager')

export interface ClipboardItem {
  text?: string
  image?: NativeImage
  html?: string
  rtf?: string
  timestamp: number
  preview: string
}

export interface ClipboardPreview {
  id: string
  preview: string
  timestamp: number
}

export interface PaletteTriggerContext {
  selectedText?: string
  clipboardPreview?: ClipboardPreview[]
  sourceApp?: string
}

export class ClipboardManager {
  private clipboardHistory: ClipboardItem[] = []
  private clipboardWatcherInterval: NodeJS.Timeout | null = null
  private lastClipboardText: string = ''
  private lastClipboardImage: NativeImage | null = null
  private tray: Tray | null = null

  // State flags for global shortcut handling
  private isProcessingShortcut = false
  private skipNextHistoryAdd = false
  private skipHistoryAddUntil: number = 0 // Timestamp-based skip to handle multiple watcher cycles
  private originalClipboardContent: { text?: string; image?: NativeImage; html?: string; rtf?: string } = {}
  private originalFocusedApp: string | null = null

  /**
   * Sanitize string for safe use in AppleScript
   * Prevents injection attacks by escaping special characters
   */
  private sanitizeAppleScriptString(str: string): string {
    if (!str || typeof str !== 'string') {
      return ''
    }
    // Escape backslashes first, then quotes
    // Also escape newlines and other control characters that could break AppleScript
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
  }

  /**
   * Initialize the clipboard manager
   */
  initialize(): void {
    if (process.platform !== 'darwin') {
      logger.warn('ClipboardManager is macOS-only, skipping initialization')
      return
    }

    const isActive = settingsManager.get('clipboardActive') ?? true
    if (isActive) {
      this.startClipboardWatcher()
      logger.info('ClipboardManager initialized and monitoring started')
    } else {
      logger.info('ClipboardManager initialized but monitoring is disabled')
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopClipboardWatcher()
    logger.info('ClipboardManager cleaned up')
  }

  /**
   * Set the tray instance for menu integration
   */
  setTray(tray: Tray): void {
    this.tray = tray
    this.updateTrayMenu()
  }

  /**
   * Update the tray menu with current clipboard status
   */
  updateTrayMenu(): void {
    if (!this.tray) return

    const isActive = settingsManager.get('clipboardActive') ?? true
    const maxItems = settingsManager.get('clipboardMaxItems') ?? 100
    const currentCount = this.clipboardHistory.length

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Palette',
        click: () => {
          // This will be handled by main.ts
        }
      },
      { type: 'separator' },
      {
        label: `Clipboard: ${isActive ? 'ON' : 'OFF'}`,
        click: () => this.toggleActive()
      },
      {
        label: `Items: ${currentCount}/${maxItems}`,
        enabled: false
      },
      {
        label: 'Clear History',
        click: () => this.clearHistory()
      },
      { type: 'separator' },
      { label: 'Quit', click: () => require('electron').app.quit() },
    ])

    this.tray.setContextMenu(menu)
  }

  /**
   * Toggle clipboard monitoring on/off
   */
  private toggleActive(): void {
    const isActive = settingsManager.get('clipboardActive') ?? true
    const newState = !isActive

    settingsManager.set('clipboardActive', newState)

    if (newState) {
      this.startClipboardWatcher()
      logger.info('Clipboard monitoring enabled')
      new Notification({
        title: 'Clipboard Manager',
        body: 'Clipboard monitoring enabled'
      }).show()
    } else {
      this.stopClipboardWatcher()
      logger.info('Clipboard monitoring disabled')
      new Notification({
        title: 'Clipboard Manager',
        body: 'Clipboard monitoring disabled'
      }).show()
    }

    this.updateTrayMenu()
  }

  /**
   * Start monitoring clipboard changes
   */
  private startClipboardWatcher(): void {
    if (this.clipboardWatcherInterval) {
      return // Already running
    }

    // Initialize with current clipboard state (only if not already set)
    // This preserves the last known state when restarting after paste operations
    // Check if both are empty, not just one, to properly initialize state
    const currentText = clipboard.readText()
    const currentImage = clipboard.readImage()
    if (!this.lastClipboardText && !this.lastClipboardImage) {
      this.lastClipboardText = currentText
      this.lastClipboardImage = currentImage.isEmpty() ? null : currentImage
    }

    // Poll every 1000ms (optimized from 500ms for better CPU efficiency)
    // Still responsive for clipboard monitoring while reducing system overhead by ~50%
    this.clipboardWatcherInterval = setInterval(() => {
      this.checkClipboardChanges()
    }, 1000)

    logger.info('Clipboard watcher started (1000ms interval)')
  }

  /**
   * Stop monitoring clipboard changes
   */
  private stopClipboardWatcher(): void {
    if (this.clipboardWatcherInterval) {
      clearInterval(this.clipboardWatcherInterval)
      this.clipboardWatcherInterval = null
      logger.info('Clipboard watcher stopped')
    }
  }

  /**
   * Check for clipboard changes and add to history
   */
  private checkClipboardChanges(): void {
    // Skip if we're in the middle of processing a shortcut or paste operation
    const now = Date.now()
    if (this.skipNextHistoryAdd || now < this.skipHistoryAddUntil) {
      if (this.skipNextHistoryAdd) {
        this.skipNextHistoryAdd = false
      }
      const remaining = this.skipHistoryAddUntil > now ? Math.round((this.skipHistoryAddUntil - now) / 1000) : 0
      logger.debug(`Skipping clipboard history add (flag set or within skip window, ${remaining}s remaining)`)
      return
    }

    const currentText = clipboard.readText()
    const currentImage = clipboard.readImage()
    const hasImage = currentImage && !currentImage.isEmpty()

    // Check if text changed (text takes priority over image)
    if (currentText && currentText !== this.lastClipboardText) {
      this.lastClipboardText = currentText
      this.lastClipboardImage = hasImage ? currentImage : null

      const html = clipboard.readHTML()
      const rtf = clipboard.readRTF()

      this.addToHistory({
        text: currentText,
        image: hasImage ? currentImage : undefined,
        html: html || undefined,
        rtf: rtf || undefined,
        timestamp: Date.now(),
        preview: this.generatePreview(currentText, hasImage ? currentImage : null)
      })
      return
    }

    // Check if image changed (only when no text or text hasn't changed)
    if (hasImage) {
      const imageDataUrl = currentImage.toDataURL()
      const lastImageDataUrl = this.lastClipboardImage?.toDataURL()

      if (imageDataUrl !== lastImageDataUrl) {
        this.lastClipboardImage = currentImage
        this.lastClipboardText = currentText || ''

        this.addToHistory({
          image: currentImage,
          text: currentText || undefined,
          timestamp: Date.now(),
          preview: this.generatePreview(currentText || null, currentImage)
        })
      }
    } else if (!currentText && this.lastClipboardText) {
      // Clipboard was cleared - update state but don't add empty item to history
      this.lastClipboardText = ''
      this.lastClipboardImage = null
    }
  }

  /**
   * Add item to clipboard history with deduplication
   */
  private addToHistory(item: ClipboardItem): void {
    // Deduplicate: don't add if identical to recent items (check last 3 to avoid rapid duplicates)
    const recentItems = this.clipboardHistory.slice(-3)
    for (const recentItem of recentItems) {
      // Compare text items
      if (item.text && recentItem.text && item.text === recentItem.text) {
        // Also check if images match (if both have images)
        if (item.image && recentItem.image) {
          const currentDataUrl = item.image.toDataURL()
          const recentDataUrl = recentItem.image.toDataURL()
          if (currentDataUrl === recentDataUrl) {
            logger.debug('Skipping duplicate item (text and image match)')
            return
          }
        } else if (!item.image && !recentItem.image) {
          // Both are text-only and match
          logger.debug('Skipping duplicate text item')
          return
        }
      }

      // Compare image items (when no text)
      if (!item.text && !recentItem.text && item.image && recentItem.image) {
        const currentDataUrl = item.image.toDataURL()
        const recentDataUrl = recentItem.image.toDataURL()
        if (currentDataUrl === recentDataUrl) {
          logger.debug('Skipping duplicate image item')
          return
        }
      }
    }

    // Add to history
    this.clipboardHistory.push(item)
    logger.debug(`Added to clipboard history: ${item.preview}`)

    // Enforce max items limit
    const maxItems = settingsManager.get('clipboardMaxItems') ?? 100
    if (this.clipboardHistory.length > maxItems) {
      const removed = this.clipboardHistory.shift()
      logger.debug(`Removed oldest item (max ${maxItems}): ${removed?.preview}`)
    }

    // Update tray menu
    this.updateTrayMenu()
  }

  /**
   * Generate a preview string for a clipboard item
   */
  private generatePreview(text: string | null, image: NativeImage | null): string {
    if (text) {
      // Truncate to 60 characters
      const truncated = text.length > 60 ? text.substring(0, 60) + '...' : text
      // Replace newlines with spaces for preview
      return truncated.replace(/\n/g, ' ')
    }

    if (image && !image.isEmpty()) {
      const size = image.getSize()
      return `[Image: ${size.width}x${size.height}]`
    }

    return '[Empty]'
  }

  /**
   * Get clipboard preview for command palette
   */
  getClipboardPreview(): ClipboardPreview[] {
    return this.clipboardHistory.map(item => ({
      id: item.timestamp.toString(),
      preview: item.preview,
      timestamp: item.timestamp
    }))
  }

  /**
   * Clear clipboard history
   */
  clearHistory(): void {
    this.clipboardHistory = []
    logger.info('Clipboard history cleared')
    this.updateTrayMenu()

    new Notification({
      title: 'Clipboard Manager',
      body: 'Clipboard history cleared'
    }).show()
  }

  /**
   * Get clipboard history as widgets for command palette
   * Returns clipboard items in widget format (no actions)
   */
  getClipboardWidgets(): any[] {
    return this.clipboardHistory.map((item, index) => ({
      id: `clipboard-${item.timestamp}`,
      label: item.preview,
      icon: item.image ? '🖼️' : '📋',
      type: 'clipboard-item',
      timestamp: item.timestamp,
      content: item.text || '[Image]',
      actions: [] // No actions for clipboard items as requested
    })).reverse() // Most recent first
  }

  /**
   * Get N most recent clipboard items for widget display
   */
  getRecentItems(count: number = 5): ClipboardItem[] {
    return this.clipboardHistory
      .slice(-count)  // Get last N items
      .reverse()      // Most recent first
  }

  /**
   * Get clipboard item by timestamp ID
   */
  getItemById(id: string): ClipboardItem | undefined {
    const timestamp = parseInt(id, 10)
    return this.clipboardHistory.find(item => item.timestamp === timestamp)
  }

  /**
   * Paste clipboard item to focused app (auto-paste workflow)
   */
  async pasteItem(id: string): Promise<void> {
    const item = this.getItemById(id)
    if (!item) {
      logger.warn(`Clipboard item not found: ${id}`)
      return
    }

    // Temporarily stop clipboard watcher to prevent interference during paste
    const wasWatching = this.clipboardWatcherInterval !== null
    if (wasWatching) {
      this.stopClipboardWatcher()
      logger.debug('Stopped clipboard watcher for paste operation')
    }

    // Prevent this item from being re-added to history for the next 3 seconds
    // This covers multiple clipboard watcher cycles (watcher runs every 1000ms)
    // Set this BEFORE writing to clipboard to prevent race conditions
    this.skipNextHistoryAdd = true
    this.skipHistoryAddUntil = Date.now() + 3000

    // Update last known clipboard state BEFORE writing to prevent watcher from detecting this change
    // This prevents the clipboard watcher from adding the pasted item back to history
    const pastedText = item.text || ''
    const pastedImage = item.image || null
    this.lastClipboardText = pastedText
    this.lastClipboardImage = pastedImage

    // Write to system clipboard - ONLY plain text to remove all formatting
    // This ensures pasted text has no formatting from the original source
    clipboard.clear()

    if (item.image) {
      // For images, write the image
      clipboard.writeImage(item.image)
      logger.debug('Wrote clipboard item: image')
    } else if (item.text) {
      // For text, write ONLY plain text (no HTML/RTF) to strip all formatting
      clipboard.writeText(item.text)
      logger.debug('Wrote clipboard item: plain text only (formatting removed)')
    }

    // Small delay to ensure clipboard is written
    await new Promise(resolve => setTimeout(resolve, 50))

    // Close the clipboard history window first
    try {
      const { BrowserWindow } = await import('electron')
      const allWindows = BrowserWindow.getAllWindows()
      let closedWindow = false
      for (const win of allWindows) {
        if (!win.isDestroyed()) {
          const title = win.getTitle()
          // Close clipboard-history window - be more specific to avoid closing wrong windows
          // Check for exact match or clipboard-history in title
          if (title && (title.toLowerCase().includes('clipboard-history') ||
            title.toLowerCase() === 'clipboard history')) {
            win.close()
            closedWindow = true
            logger.info('Closed clipboard history window')
            break // Only close one window
          }
        }
      }
      // Wait for window to fully close and focus to restore
      // Increased delay for web apps like Gmail which need more time to restore focus
      if (closedWindow) {
        await new Promise(resolve => setTimeout(resolve, 600))
      } else {
        // Still wait a bit even if no window was found, to ensure focus is ready
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    } catch (error) {
      logger.warn('Failed to close clipboard window', error)
      // Still wait a bit for focus to restore
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    // Re-capture focused app AFTER closing window to ensure we have the correct app
    // This ensures we paste to the original app, not the clipboard window
    const focusedApp = await this.captureFocusedApp()
    const targetApp = focusedApp || this.originalFocusedApp

    if (!targetApp) {
      logger.warn('No target app available for paste - clipboard content is set but paste may fail')
      // Still continue - user can paste manually if needed
    }

    // Simulate Cmd+V via AppleScript with focus restoration
    if (process.platform === 'darwin') {
      try {
        let script: string

        logger.info(`Preparing to paste. targetApp: ${targetApp || 'null'}, item: ${item.preview.substring(0, 30)}`)

        if (targetApp) {
          // We have a target app - activate it then paste
          // Sanitize app name to prevent AppleScript injection
          const safeAppName = this.sanitizeAppleScriptString(targetApp)
          // Improved focus handling for web apps like Gmail
          // Gmail's subject/to fields need more time to be ready after app activation
          // We activate, wait for app to be frontmost, then add extra delay for field focus
          script = `tell application "${safeAppName}" to activate
delay 0.5
tell application "System Events"
  -- Wait for the app to be frontmost (with timeout to prevent infinite loop)
  set maxWait to 20
  set waitCount to 0
  repeat while (name of first application process whose frontmost is true) is not "${safeAppName}" and waitCount < maxWait
    delay 0.05
    set waitCount to waitCount + 1
  end repeat
  -- Extra delay to ensure input field is focused and ready (critical for Gmail fields)
  delay 0.4
  -- Send paste command
  keystroke "v" using command down
end tell`
        } else {
          // No target app - just send keystroke to frontmost app
          // Increased delay to ensure field is ready (especially for web app fields)
          script = `delay 0.6
tell application "System Events"
  keystroke "v" using command down
end tell`
        }

        // Write script to temp file to avoid quote escaping issues
        const tempPath = join(app.getPath('temp'), `paste-${Date.now()}.scpt`)
        writeFileSync(tempPath, script, 'utf8')

        try {
          await execAsync(`osascript "${tempPath}"`)
          logger.info(`Auto-pasted to ${targetApp || 'frontmost app'}: ${item.preview}`)
        } finally {
          // Clean up temp file
          try {
            unlinkSync(tempPath)
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      } catch (error) {
        logger.error('Failed to auto-paste', error)
        // Don't throw - clipboard is already set, user can paste manually
      }
    }

    // Restart clipboard watcher after paste operation completes
    // Wait a bit longer to ensure any clipboard changes from the paste are ignored
    await new Promise(resolve => setTimeout(resolve, 500))

    // Only restart watcher if it was running before AND clipboard monitoring is enabled
    if (wasWatching) {
      const isActive = settingsManager.get('clipboardActive') ?? true
      if (isActive) {
        // Restart watcher but preserve the last known state we set
        // This prevents the watcher from detecting the pasted item as a new change
        this.clipboardWatcherInterval = setInterval(() => {
          this.checkClipboardChanges()
        }, 1000)
        logger.debug('Restarted clipboard watcher after paste operation')
      } else {
        logger.debug('Clipboard monitoring is disabled, not restarting watcher')
      }
    }

    // Keep skip window active for a bit longer to catch any delayed clipboard changes
    // This ensures that even if the watcher detects a change, it won't add it to history
    this.skipHistoryAddUntil = Date.now() + 2000
  }




  /**
   * Capture the focused application name using AppleScript
   */
  private async captureFocusedApp(): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    try {
      const script = `tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  return frontApp
end tell`

      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
      const appName = stdout.trim()
      logger.info(`Captured focused app: ${appName}`)
      return appName
    } catch (error) {
      logger.error('Failed to capture focused app', error)
      return null
    }
  }

  /**
   * Public method to capture focused app for paste operations
   * Called from main.ts before opening palette
   */
  async captureFocusedAppForPaste(): Promise<void> {
    this.originalFocusedApp = await this.captureFocusedApp()
    logger.info(`Stored focused app for paste: ${this.originalFocusedApp || 'null'}`)
  }

  /**
   * Capture selected text using Cmd+C simulation with retry logic
   */
  private async captureSelectedText(): Promise<string> {
    if (process.platform !== 'darwin') {
      return ''
    }

    // Save original clipboard content
    this.originalClipboardContent = {
      text: clipboard.readText(),
      image: clipboard.readImage(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF()
    }

    const maxRetries = 10
    const retryDelay = 20 // ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Simulate Cmd+C
        const script = `tell application "System Events"
  keystroke "c" using command down
end tell`

        await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)

        // Wait for clipboard to update
        await new Promise(resolve => setTimeout(resolve, retryDelay))

        const capturedText = clipboard.readText()

        // Check if we got new content
        if (capturedText && capturedText !== this.originalClipboardContent.text) {
          logger.info(`Captured selected text (attempt ${attempt}): "${capturedText.substring(0, 50)}${capturedText.length > 50 ? '...' : ''}"`)
          return capturedText
        }

        if (attempt < maxRetries) {
          logger.debug(`Attempt ${attempt} failed, retrying...`)
        }
      } catch (error) {
        logger.error(`Error on attempt ${attempt}:`, error)
      }
    }

    logger.warn('Failed to capture selected text after all retries')
    return ''
  }

  /**
   * Restore the original clipboard content
   */
  private restoreClipboard(): void {
    try {
      // Clear clipboard first if original was empty
      const hadContent = this.originalClipboardContent.text ||
        (this.originalClipboardContent.image && !this.originalClipboardContent.image.isEmpty()) ||
        this.originalClipboardContent.html ||
        this.originalClipboardContent.rtf

      if (!hadContent) {
        // Original was empty, clear clipboard
        clipboard.clear()
        logger.debug('Restored empty clipboard')
        return
      }

      // Restore content in proper order
      if (this.originalClipboardContent.text) {
        clipboard.writeText(this.originalClipboardContent.text)
      }
      if (this.originalClipboardContent.image && !this.originalClipboardContent.image.isEmpty()) {
        clipboard.writeImage(this.originalClipboardContent.image)
      }
      if (this.originalClipboardContent.html) {
        clipboard.writeHTML(this.originalClipboardContent.html)
      }
      if (this.originalClipboardContent.rtf) {
        clipboard.writeRTF(this.originalClipboardContent.rtf)
      }
      logger.debug('Restored original clipboard content')
    } catch (error) {
      logger.error('Failed to restore clipboard', error)
    }
  }

  /**
   * Handle global shortcut (Alt+Shift+N)
   * Returns enriched context for command palette
   */
  async handleGlobalShortcut(): Promise<PaletteTriggerContext> {
    // Prevent re-entry
    if (this.isProcessingShortcut) {
      logger.warn('Global shortcut already processing, ignoring')
      return {}
    }

    this.isProcessingShortcut = true

    try {
      // Capture focused app
      this.originalFocusedApp = await this.captureFocusedApp()

      // Capture selected text
      const selectedText = await this.captureSelectedText()

      // Set flag to skip next clipboard history add
      this.skipNextHistoryAdd = true

      // Restore original clipboard
      this.restoreClipboard()

      // Build context
      const context: PaletteTriggerContext = {
        selectedText: selectedText || undefined,
        clipboardPreview: this.getClipboardPreview(),
        sourceApp: this.originalFocusedApp || undefined
      }

      logger.info('Global shortcut context:', {
        selectedText: selectedText ? `"${selectedText.substring(0, 30)}..."` : 'none',
        clipboardItems: context.clipboardPreview?.length || 0,
        sourceApp: context.sourceApp || 'unknown'
      })

      return context
    } finally {
      // Reset processing flag after a short delay to prevent accidental re-triggering
      setTimeout(() => {
        this.isProcessingShortcut = false
      }, 500)
    }
  }
}
