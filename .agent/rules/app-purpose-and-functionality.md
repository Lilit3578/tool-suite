---
trigger: always_on
---

Purpose:

The app “Double Copy Paste” is a macOS-focused productivity utility that gives users a fast, context-aware command palette and an extended multi-item clipboard so they can manipulate, inspect, and instantly paste recent clipboard items and run small utilities (translate, convert, look up, etc.) without leaving their current app.
High-level behavior:

Runs in the Electron main process and exposes a small always-on-top command palette (opened with a global shortcut).
Continuously records clipboard changes into an in-memory history with rich content (text, HTML, RTF, images) and previews.
When the palette opens it receives a bootstrap payload containing the current context (selected text, top N clipboard previews, source app, and context insights) so the renderer can surface relevant widgets and actions.
Widgets perform quick tasks (translate, currency conversion, unit conversion, word count, color picker, define a word) using either local logic or external APIs (API keys live in .env).
Core features and how each should function:

Clipboard History (primary widget): show the five most recent items (Item 1 → clipboardHistory[0]), allow arrow/Enter, numeric (1–5), or click selection; on select, write the chosen ClipboardItem back to system clipboard and—if enabled—restore focus to the original app and simulate Cmd+V to paste immediately. Use skipNextHistoryAdd after writing to avoid re-adding.
Global Shortcut: register Alt+Shift+N (⌥+⇧+N) to open the palette, capture current focused app via AppleScript, and (optionally) simulate Cmd+C to capture selected text before showing the palette.
Command Palette & Widgets: palette receives PaletteBootstrapPayload (see types.ts) and renders widgets using the renderer (ShadCN Command component). Widgets may open richer UI windows or execute inline actions via the commandPaletteService.
Auto-Paste Flow: when auto-paste is enabled, selecting an item closes the palette, activates the original app (tell application "Name" to activate), waits briefly, then sends keystroke "v" using {command down} via AppleScript. Fallback if Accessibility blocked: clipboard is restored but user must press Cmd+V manually.
Tray & Settings: tray menu toggles clipboard monitoring, shows item counts, and exposes Clear History and Quit; settingsManager persists prefs (max history size, active state, clipboardAutoPaste opt-in, etc.).
Usage metrics & ranking: usage metrics store widget/action counts and can be synced; ranking/context detector uses clipboard + selection to surface relevant actions (e.g., currency detection, language detection).
Windows and lifecycle: use windowManager to create, position, and persist window bounds for palette and utility windows; windows are frameless, alwaysOnTop, skipTaskbar.
Data & IPC flows (who does what):

Main process: clipboard polling (clipboard.readText()/readImage()), history management, global shortcuts, tray, AppleScript interactions, commandPaletteService (opens/closes palette), and exposing IPC handlers (e.g., command-palette/*, clipboard/paste-item). See clipboard-manager.tsx, main.tsx, and command-palette-service.ts.
Renderer (palette): requests bootstrap via IPC (command-palette/get-bootstrap), displays context.clipboardPreview, sends paste requests (clipboard/paste-item) with timestamp ID, and receives updates. Use the preload bridge for secure IPC (contextIsolation).
Payload shape: PaletteBootstrapPayload contains context (selectedText, clipboardPreview, sourceApp, insights), state (query), widgets and actions metas, and usage snapshot.
Permissions, failure modes & UX safeguards:

Auto-paste requires macOS Accessibility permission to script System Events. If blocked, the app should: log the failure, notify the user once, and gracefully fall back to only restoring the clipboard. Document the requirement in preferences/in-app help.
Always close the palette before simulating paste to avoid consuming the keystroke inside the palette. Add small delays (80–150 ms) between activate and keystroke for reliable delivery.
Provide an opt-out setting clipboardAutoPaste (default true/opt-in) so users can disable automatic keystrokes.
Security & privacy:

API keys (e.g., exchange rate and Google Translate) are read from .env and used only server-side (main process) or via secure SDKs; do not commit .env to version control. The app should avoid transmitting clipboard contents externally except when a specific widget explicitly calls an external API — and then only minimal, user-intended data should be sent. Make this behavior transparent in settings/privacy.
Developer notes / files to look at:

Main clipboard logic: clipboard-manager.tsx
App bootstrap and tray: main.tsx
Command palette orchestration: command-palette-service.ts and command-palette-window.ts
Types/IPC payloads: types.ts
Widget registry: registry.ts
Window management: window-manager.ts
Preload / renderer bundle: preload/preload.ts and renderer/palette (dist assets used by CommandPaletteWindow.resolveLoadTarget())