// src/main/text-capture.ts
import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createLogger } from './logger'

const execAsync = promisify(exec)
const logger = createLogger('TextCapture')

/**
 * Captures the currently selected text from the foreground application on macOS.
 * Uses AppleScript to simulate Cmd+C and reads from clipboard using Electron's API.
 */
export async function captureSelectedText(): Promise<string> {
  if (process.platform !== 'darwin') {
    logger.warn('Text capture only supported on macOS')
    return ''
  }

  try {
    // Save original clipboard content
    const originalText = clipboard.readText()

    // Use AppleScript to copy selected text (simulates Cmd+C)
    // IMPORTANT: Only send the copy command, do NOT try to read clipboard in AppleScript
    // This avoids errors when clipboard contains non-text data
    const script = `tell application "System Events"
  keystroke "c" using command down
end tell`

    try {
      // Execute the copy command - wrap in try-catch to handle any AppleScript errors gracefully
      await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
    } catch (scriptError: any) {
      // If AppleScript fails, log but continue - we'll try to read clipboard anyway
      logger.debug('AppleScript copy command had an issue (non-fatal):', scriptError?.message || scriptError)
      // Still wait a bit in case the copy actually succeeded
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Wait a bit for clipboard to update (increased delay for reliability)
    await new Promise(resolve => setTimeout(resolve, 200))

    // Read clipboard using Electron's API (more reliable than AppleScript)
    // This handles cases where clipboard contains non-text data gracefully
    let capturedText = ''
    try {
      capturedText = clipboard.readText() || ''
    } catch (readError) {
      logger.debug('Failed to read clipboard text (may contain non-text data):', readError)
      return ''
    }

    // Only log if we actually captured new text
    if (capturedText && capturedText !== originalText) {
      logger.info(`Captured text: "${capturedText.substring(0, 50)}${capturedText.length > 50 ? '...' : ''}"`)
      return capturedText
    } else if (capturedText) {
      // Same text as before - no new selection captured
      logger.debug('No new text captured (same as clipboard)')
      return ''
    } else {
      // No text in clipboard
      logger.debug('No text captured (clipboard may contain non-text data or no selection)')
      return ''
    }
  } catch (error: any) {
    // Catch-all for any unexpected errors - log but don't crash
    logger.error('Failed to capture selected text:', error?.message || error)
    // Return empty string on error - don't break the flow
    return ''
  }
}

