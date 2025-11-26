# Widget Window Fix Summary

## Problem Statement
Translator and Currency Converter widgets were:
1. **Opening on the wrong space** - Redirected to Home Screen instead of appearing in the same space as the Command Palette (especially in full-screen mode)
2. **Disappearing immediately** - Widgets would appear and then instantly disappear when opened from full-screen windows

---

## Root Causes Identified

### Issue #1: Space Switching
- macOS was assigning widgets to different spaces based on window creation position
- `visibleOnAllWorkspaces` was being set too late (after window creation)
- Position was being set in BrowserWindow constructor, causing macOS to "remember" wrong display
- Command Palette itself was switching spaces (position changes in logs)

### Issue #2: Widget Disappearing
- Widgets were being parented to the Command Palette window
- When Command Palette hides (after opening widgets), child windows also hide
- `BrowserWindow.getFocusedWindow()` was returning the Command Palette, not the external full-screen app

---

## Complete Fix Implementation

### 1. Window Creation Without Position (CRITICAL)
**File**: `src/main/core/window/factory.ts`

**Change**: Removed `x` and `y` from BrowserWindow constructor
```typescript
// BEFORE: Window created with position
const win = new BrowserWindow({
  x: windowX,
  y: windowY,
  // ...
})

// AFTER: Window created WITHOUT position
const win = new BrowserWindow({
  // x and y removed - will be set AFTER visibleOnAllWorkspaces
  // ...
})
```

**Why**: macOS assigns windows to spaces based on constructor position. By creating without position, then setting `visibleOnAllWorkspaces`, then positioning, we prevent macOS from making the wrong assignment.

---

### 2. visibleOnAllWorkspaces Set Before Position
**File**: `src/main/core/window/factory.ts`

**Change**: Set `visibleOnAllWorkspaces` immediately after window creation, BEFORE setting position
```typescript
// Set visibleOnAllWorkspaces FIRST
if (windowConfig.visibleOnAllWorkspaces !== undefined) {
  ;(win as any).setVisibleOnAllWorkspaces(windowConfig.visibleOnAllWorkspaces, { visibleOnFullScreen: true })
  await new Promise(resolve => setTimeout(resolve, 10))
}

// THEN set position
win.setPosition(windowX, windowY, false)
```

**Why**: Ensures macOS knows the window should appear on all spaces before position is set.

---

### 3. Display-Aware Position Calculation
**File**: `src/main/core/window/factory.ts`, `src/main/index.ts`, `src/main/widgets/widget-manager.ts`

**Change**: Use stored display from Command Palette, clamp cursor coordinates to display bounds
```typescript
// Get stored display from Command Palette
const storedDisplay = (global as any).currentPaletteDisplay
const cursor = position || screen.getCursorScreenPoint()
const display = storedDisplay || screen.getDisplayNearestPoint(cursor)

// Clamp cursor to display bounds
let cursorX = cursor.x
let cursorY = cursor.y
if (storedDisplay) {
  cursorX = Math.max(display.bounds.x, Math.min(cursorX, display.bounds.x + display.bounds.width))
  cursorY = Math.max(display.bounds.y, Math.min(cursorY, display.bounds.y + display.bounds.height))
}

// Calculate position relative to correct display
windowX = cursorX - Math.round(windowConfig.width / 2)
windowY = cursorY - Math.round(windowConfig.height / 2)
```

**Why**: Ensures position is calculated relative to the correct display, not the cursor's display (which might be different).

---

### 4. Independent Widget Windows (No Parent to Palette)
**File**: `src/main/core/window/factory.ts`

**Change**: Check if focused window is our app's window, don't use it as parent
```typescript
const focused = BrowserWindow.getFocusedWindow()

// Check if focused window is our Command Palette
if (focused) {
  const allOurWindows = BrowserWindow.getAllWindows()
  const isOurAppWindow = allOurWindows.some(w => w.id === focused.id)
  
  if (isOurAppWindow) {
    // Don't parent to our own windows - widgets must be independent
    focusedWindow = null
  } else {
    // External app (full-screen app) - use as parent
    focusedWindow = focused
  }
}

const win = new BrowserWindow({
  parent: focusedWindow || undefined, // Independent if no external parent
  // ...
})
```

**Why**: Prevents widgets from disappearing when Command Palette hides. Widgets are now independent windows that stay visible.

---

### 5. Window Type Consistency
**File**: `src/main/core/window/factory.ts`, `src/main/core/window/registry.ts`

**Changes**:
- Added `fullscreenable: false` to prevent widgets from becoming top-level fullscreen windows
- Added `type: 'panel'` to match Command Palette window type
- Added `modal: false` to match Command Palette
- Ensured `alwaysOnTop: true` and `skipTaskbar: true` match Command Palette

```typescript
const win = new BrowserWindow({
  modal: false, // Same as Command Palette
  frame: windowConfig.frame ?? false,
  alwaysOnTop: windowConfig.alwaysOnTop ?? true,
  fullscreenable: false, // CRITICAL: Prevent top-level fullscreen
  skipTaskbar: windowConfig.skipTaskbar ?? true,
  type: 'panel', // Same window type as Command Palette
  // ...
})
```

**Why**: Ensures widgets behave consistently with Command Palette and don't become independent fullscreen windows.

---

### 6. Removed focus() Calls
**File**: `src/main/index.ts`

**Change**: Removed `win.focus()` call from Command Palette
```typescript
// BEFORE:
setTimeout(() => {
  win.focus() // This triggered space switching
}, 50)

// AFTER:
// DO NOT call focus() - it triggers space switching!
// Window is usable without focus
```

**Why**: `focus()` calls trigger app activation, which causes macOS to switch spaces.

---

### 7. Command Palette Display Storage
**File**: `src/main/index.ts`

**Change**: Store display when Command Palette opens, reuse stored value
```typescript
// Store display when palette opens
const currentDisplay = screen.getDisplayNearestPoint(cursor)
;(global as any).currentPaletteDisplay = currentDisplay

// Reuse stored display (don't recalculate)
const display = currentDisplay // Not screen.getDisplayNearestPoint(cursor) again
```

**Why**: Ensures widgets use the same display as the Command Palette, even if cursor moves.

---

### 8. Widget Manager Display Usage
**File**: `src/main/widgets/widget-manager.ts`

**Change**: Use stored display for all widget positioning
```typescript
// Use stored display from Command Palette
const storedDisplay = (global as any).currentPaletteDisplay
const cursor = screen.getCursorScreenPoint()
const display = storedDisplay || screen.getDisplayNearestPoint(cursor)

// Calculate position within stored display bounds
const displayX = Math.max(display.bounds.x, Math.min(cursor.x, display.bounds.x + display.bounds.width - 100))
const displayY = Math.max(display.bounds.y, Math.min(cursor.y, display.bounds.y + display.bounds.height - 100))
```

**Why**: Ensures widgets appear on the same display/space as Command Palette.

---

### 9. Multiple visibleOnAllWorkspaces Calls
**File**: `src/main/core/window/factory.ts`, `src/main/index.ts`, `src/main/widgets/widget-manager.ts`

**Change**: Call `setVisibleOnAllWorkspaces(true)` multiple times with delays
```typescript
// Call multiple times to ensure macOS respects it
;(win as any).setVisibleOnAllWorkspaces(true)
await new Promise(resolve => setTimeout(resolve, 20))
;(win as any).setVisibleOnAllWorkspaces(true)
await new Promise(resolve => setTimeout(resolve, 20))
```

**Why**: macOS sometimes ignores the first call. Multiple calls with delays ensure it takes effect.

---

### 10. App Activation Policy
**File**: `src/main/index.ts`

**Change**: Use `app.setActivationPolicy('accessory')` instead of `app.dock.hide()`
```typescript
// BEFORE:
app.dock.hide()

// AFTER:
app.setActivationPolicy('accessory')
```

**Why**: Prevents app from appearing in Dock and significantly reduces space switching when windows are shown.

---

### 11. App Hiding Before/After showInactive()
**File**: `src/main/core/window/factory.ts`, `src/main/index.ts`, `src/main/widgets/widget-manager.ts`

**Change**: Call `app.hide()` before and after `showInactive()`
```typescript
// Hide app before showing
if (process.platform === 'darwin') {
  app.hide()
  await new Promise(resolve => setTimeout(resolve, 10))
}

win.showInactive()

// Hide app again after showing
if (process.platform === 'darwin') {
  app.hide()
}
```

**Why**: Prevents app activation which triggers space switching.

---

### 12. Position Verification and Correction
**File**: `src/main/core/window/factory.ts`, `src/main/index.ts`, `src/main/widgets/widget-manager.ts`

**Change**: Verify position after showing, correct if changed significantly
```typescript
const [afterShowX, afterShowY] = win.getPosition()
if (Math.abs(afterShowY - expectedY) > 10) {
  // Position changed - correct it
  for (let i = 0; i < 5; i++) {
    win.setPosition(expectedX, expectedY, false)
    await new Promise(resolve => setTimeout(resolve, 20))
    const [currentX, currentY] = win.getPosition()
    if (Math.abs(currentY - expectedY) < 5) {
      break // Position corrected
    }
  }
}
```

**Why**: Detects and corrects position changes that indicate space switching.

---

### 13. Window Level Consistency
**File**: `src/main/core/window/factory.ts`

**Change**: Set window level to `'pop-up-menu'` for all widgets (same as Command Palette)
```typescript
win.setAlwaysOnTop(true, 'pop-up-menu', 1)
```

**Why**: Ensures widgets appear at the same level as Command Palette and can appear in full-screen spaces.

---

### 14. Collection Behavior (macOS Full-Screen Support)
**File**: `src/main/core/window/factory.ts`

**Change**: Attempt to set NSWindow collection behavior
```typescript
// NSWindowCollectionBehaviorCanJoinAllSpaces = 1
// NSWindowCollectionBehaviorFullScreenAuxiliary = 256
const collectionBehavior = 1 | 256
if (typeof (win as any).setCollectionBehavior === 'function') {
  (win as any).setCollectionBehavior(collectionBehavior)
}
```

**Why**: Allows windows to appear in full-screen app spaces (though this API may not be available in Electron).

---

### 15. visibleOnAllWorkspaces for All Widgets
**File**: `src/main/core/window/registry.ts`

**Change**: Added `visibleOnAllWorkspaces: true` to clipboard-history widget config
```typescript
'clipboard-history': {
  // ...
  visibleOnAllWorkspaces: true, // Added
}
```

**Why**: Ensures all widgets have consistent space behavior.

---

### 16. Fixed esbuild.main.js Entry Point
**File**: `esbuild.main.js`

**Change**: Fixed entry point from `src/main/main.ts` to `src/main/index.ts`
```typescript
// BEFORE:
entryPoints: ["src/main/main.ts"],
outfile: "dist/main/main.js",

// AFTER:
entryPoints: ["src/main/index.ts"],
outfile: "dist/main/index.js",
```

**Why**: Dev watch process was building wrong file, causing cache issues.

---

## Final Window Creation Flow

1. **Get stored display** from Command Palette (or use cursor display)
2. **Calculate position** relative to stored display (clamp cursor to display bounds)
3. **Create window WITHOUT position** in constructor
4. **Set visibleOnAllWorkspaces** immediately after creation (with `visibleOnFullScreen: true` option)
5. **Set position** after visibleOnAllWorkspaces
6. **Check parent window** - only use external app windows, not our own windows
7. **Set window properties** (fullscreenable: false, type: 'panel', etc.)
8. **Set alwaysOnTop** to 'pop-up-menu' level
9. **Load URL and show** with `showInactive()` (no focus)
10. **Verify position** and correct if changed

---

## Key Principles Applied

1. **Windows are independent** - Not children of Command Palette
2. **visibleOnAllWorkspaces set first** - Before any position operations
3. **Position set after** - After visibleOnAllWorkspaces is established
4. **No focus() calls** - Prevents app activation and space switching
5. **Display-aware positioning** - Uses stored display from Command Palette
6. **Consistent window properties** - Match Command Palette exactly
7. **Multiple safety checks** - Position verification, app hiding, multiple visibleOnAllWorkspaces calls

---

## Files Modified

1. `src/main/core/window/factory.ts` - Window creation logic
2. `src/main/index.ts` - Command Palette and translator window creation
3. `src/main/widgets/widget-manager.ts` - Widget window management
4. `src/main/core/window/registry.ts` - Window configuration
5. `esbuild.main.js` - Build configuration fix

---

## Testing Checklist

- [ ] Widgets appear in same space as Command Palette in normal mode
- [ ] Widgets appear in same space as Command Palette in full-screen mode
- [ ] Widgets stay visible when Command Palette hides
- [ ] Widgets don't cause space switching
- [ ] Widgets appear at cursor position
- [ ] Widgets work for both new and reused windows
- [ ] Position corrections work if macOS moves window

