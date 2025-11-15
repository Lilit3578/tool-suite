// src/main/text-capture.ts
import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createLogger } from './logger'

const execAsync = promisify(exec)
const logger = createLogger('TextCapture')

/**
 * Captures the currently selected text from the foreground application on macOS.
 * Uses AppleScript to simulate Cmd+C and read from clipboard.
 */
export async function captureSelectedText(): Promise<string> {
  if (process.platform !== 'darwin') {
    logger.warn('Text capture only supported on macOS')
    return ''
  }

  try {
    // Use AppleScript to copy selected text (simulates Cmd+C)
    // This works by telling the frontmost application to copy
    const script = `tell application "System Events"
  keystroke "c" using command down
end tell
delay 0.15
return the clipboard as string`

    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
    const capturedText = stdout.trim()

    logger.info(`Captured text: "${capturedText.substring(0, 50)}${capturedText.length > 50 ? '...' : ''}"`)
    return capturedText
  } catch (error) {
    logger.error('Failed to capture selected text', error)
    // Return empty string on error - don't break the flow
    return ''
  }
}

