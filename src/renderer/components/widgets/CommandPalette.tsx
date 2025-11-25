import React, { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  CornerDownRight,
  Clipboard,
  Pipette,
  Languages,
  BookOpen,
  MessageSquare,
  Globe,
  DollarSign,
  Ruler,
  ArrowRight,
} from "lucide-react"

// ===========================
// Types
// ===========================
type Suggestion = { id: string; label: string; type: "widget" | "action" }
type Widget = { id: string; label: string; icon?: string; actions?: any[] }

// ===========================
// Icon router
// ===========================
const getIcon = (label: string, type: "widget" | "action") => {
  const lower = label.toLowerCase()
  if (lower.includes("clipboard")) return <Clipboard className="w-4 h-4" />
  if (lower.includes("color")) return <Pipette className="w-4 h-4" />
  if (lower.includes("translator")) return <Languages className="w-4 h-4" />
  if (lower.includes("dictionary")) return <BookOpen className="w-4 h-4" />
  if (lower.includes("counter")) return <MessageSquare className="w-4 h-4" />
  if (lower.includes("clock")) return <Globe className="w-4 h-4" />
  if (lower.includes("currency")) return <DollarSign className="w-4 h-4" />
  if (lower.includes("units")) return <Ruler className="w-4 h-4" />
  if (lower.includes("translate") || lower.includes("convert"))
    return <ArrowRight className="w-4 h-4" />
  return <ArrowRight className="w-4 h-4" />
}

// ===========================
// Main Component
// ===========================
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [capturedText, setCapturedText] = useState("")
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)

  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popoverContent, setPopoverContent] = useState("")
  const [popoverIsError, setPopoverIsError] = useState(false)
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null)
  const [isNearRightEdge, setIsNearRightEdge] = useState(false)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const actionRefs = useRef<Record<string, HTMLElement>>({})
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Handle mouse events to toggle click-through for transparent areas
  useEffect(() => {
    if (!open) return

    let lastIgnoreState: boolean | null = null

    const handleMouseMove = (e: MouseEvent) => {
      const paletteWidth = 270
      let isOverPalette = e.clientX <= paletteWidth
      let isOverPopover = false

      if (popoverOpen) {
        if (isNearRightEdge) {
          // Popover is on the left (negative X from palette edge)
          // Popover extends from -250px to 0px (left of palette)
          isOverPopover = e.clientX >= -250 && e.clientX < 0
          // Consider both palette and popover as interactive area
          isOverPalette = isOverPalette || isOverPopover
        } else {
          // Popover is on the right (positive X from palette edge)
          isOverPopover = e.clientX >= 280 && e.clientX <= 550
        }
      }

      const shouldIgnore = !isOverPalette && !isOverPopover

      // Only update if state changed
      if (shouldIgnore !== lastIgnoreState) {
        console.log('Mouse at:', e.clientX, 'shouldIgnore:', shouldIgnore)
        lastIgnoreState = shouldIgnore

        if (window.electronAPI?.setIgnoreMouseEvents) {
          window.electronAPI.setIgnoreMouseEvents(shouldIgnore)
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      // Reset to interactive when unmounting
      if (window.electronAPI?.setIgnoreMouseEvents) {
        window.electronAPI.setIgnoreMouseEvents(false)
      }
    }
  }, [open, popoverOpen])

  // Load widgets once
  useEffect(() => {
    async function loadWidgets() {
      const w = await window.electronAPI.getWidgets()
      setWidgets(w)
    }
    loadWidgets()
  }, [])

  // Open the palette
  useEffect(() => {
    const onShow = async (_event: any, data?: { capturedText?: string }) => {
      setOpen(true)
      setSelectedActionId(null)
      setPopoverOpen(false) // Close popover when palette opens

      // Calculate if near right edge for popover positioning
      if (window.electronAPI?.getWindowPosition) {
        try {
          const { windowX, screenWidth } = await window.electronAPI.getWindowPosition()
          const paletteWidth = 270
          const popoverWidth = 250
          const margin = 20
          const totalWidth = paletteWidth + popoverWidth + margin

          // Check if popover would go off-screen on the right
          const wouldClip = (windowX + totalWidth) > screenWidth
          setIsNearRightEdge(wouldClip)
          console.log('Popover positioning:', { windowX, screenWidth, wouldClip, side: wouldClip ? 'left' : 'right' })
        } catch (error) {
          console.error('Error getting window position:', error)
          setIsNearRightEdge(false)
        }
      }

      if (data?.capturedText) setCapturedText(data.capturedText)
      else window.electronAPI.getCapturedText().then(setCapturedText)
    }
    window.electronAPI.onPaletteOpened?.(onShow)
  }, [])

  // Update suggestions with debouncing (150ms) for better performance
  useEffect(() => {
    let active = true

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Debounce search queries to reduce IPC calls
    debounceTimerRef.current = setTimeout(async () => {
      const res = await window.electronAPI.getSuggestions(query || "")
      if (active) setSuggestions(res)
    }, query ? 150 : 0) // Immediate if empty query, 150ms delay for typed queries

    return () => {
      active = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query])

  // Execute widget - memoized with useCallback for stable reference
  const handleOpenWidget = useCallback(async (widgetId: string) => {
    try {
      const text = capturedText || await window.electronAPI.getCapturedText()
      const res = await window.electronAPI.openWidget(widgetId, { selectedText: text })
      if (res?.success !== false) {
        // Hide the React component
        setOpen(false)
        // Actually hide the Electron window
        if (window.electronAPI?.hideCurrentWindow) {
          await window.electronAPI.hideCurrentWindow()
        }
      }
    } catch (error) {
      console.error('Error opening widget:', error)
    }
  }, [capturedText])

  // Execute action with popover - memoized with useCallback
  const handleExecuteAction = useCallback(async (actionId: string, triggerElement: HTMLElement) => {
    console.log('=== handleExecuteAction START ===')
    console.log('actionId:', actionId)
    console.log('triggerElement:', triggerElement)
    setSelectedActionId(actionId)

    try {
      const text = capturedText || await window.electronAPI.getCapturedText()

      console.log('Executing action:', actionId, 'with text:', text)

      if (!window.electronAPI?.executeAction) {
        console.error('executeAction not available on window.electronAPI')
        return
      }

      const res = await window.electronAPI.executeAction(actionId, text)
      console.log('=== RAW ACTION RESULT ===')
      console.log('Type:', typeof res)
      console.log('Full object:', res)
      console.log('res.success:', res?.success)
      console.log('res.result:', res?.result)
      console.log('res.result type:', typeof res?.result)
      if (res?.result) {
        console.log('res.result.translatedText:', res.result.translatedText)
        console.log('res.result.detectedSourceLanguage:', res.result.detectedSourceLanguage)
      }

      let resultText = ''
      let isError = false

      // Handle the nested result structure
      if (res && typeof res === 'object') {
        if (res.success === true && res.result) {
          console.log('Success branch - res.result:', res.result)

          // Check for translation result first (most specific)
          if (typeof res.result === 'object' && res.result.translatedText) {
            // Translation result - only show the translated text
            resultText = res.result.translatedText
            isError = false
            console.log('✓ Extracted translation:', resultText)
          }
          // Check if res.result is itself a response object (double-wrapped)
          else if (typeof res.result === 'object' && 'success' in res.result) {
            console.log('Double-wrapped result detected')
            // Unwrap the inner response
            if (res.result.success === true && res.result.result) {
              resultText = typeof res.result.result === 'string'
                ? res.result.result
                : String(res.result.result)
              isError = false
            } else if (res.result.success === false) {
              resultText = res.result.error || 'Unknown error'
              isError = true
            } else {
              resultText = 'Unexpected response format'
              isError = true
            }
          } else if (typeof res.result === 'string') {
            // Direct string result
            console.log('String result:', res.result)
            resultText = res.result
            isError = false
          } else {
            // For other objects, try to extract meaningful text
            console.log('Other object type, trying to extract text')
            // Avoid showing [object Object] by checking common properties
            if (res.result.text) {
              resultText = res.result.text
            } else if (res.result.value) {
              resultText = res.result.value
            } else {
              // Last resort: stringify the object properly
              console.warn('Could not find text/value property, stringifying:', res.result)
              resultText = JSON.stringify(res.result, null, 2)
            }
            isError = false
          }
        } else if (res.success === false) {
          // Just show the error message without "Error:" prefix since we style it red
          resultText = res.error || 'Unknown error'
          isError = true
        } else {
          // Unexpected response format
          console.error('Unexpected response format:', res)
          resultText = 'Unexpected response format'
          isError = true
        }
      } else {
        console.log('Non-object result:', res)
        resultText = typeof res === 'string' ? res : String(res)
        isError = false
      }

      console.log('Final resultText:', resultText, 'isError:', isError)

      // Set popover content and anchor
      setPopoverContent(resultText)
      setPopoverIsError(isError)
      setPopoverAnchor(triggerElement)
      setPopoverOpen(true)

      console.log('Popover opened!')

      // Auto-hide after 3 seconds
      setTimeout(() => {
        console.log('Auto-hiding popover')
        setPopoverOpen(false)
        setSelectedActionId(null)
      }, 3000)
    } catch (error) {
      console.error('Error executing action:', error)
      setPopoverContent(`Error: ${String(error)}`)
      setPopoverAnchor(triggerElement)
      setPopoverOpen(true)
    }
  }, [capturedText, popoverOpen, selectedActionId, isNearRightEdge])

  // Memoize expensive filtering operations to prevent recalculation on every render
  const suggestedItems = useMemo(() => suggestions.slice(0, 4), [suggestions])
  const suggestedIds = useMemo(() => new Set(suggestedItems.map(s => s.id)), [suggestedItems])

  // Filter out items already shown in suggested - memoized
  const actionItems = useMemo(() =>
    suggestions.filter((s) => s.type === "action" && !suggestedIds.has(s.id)),
    [suggestions, suggestedIds]
  )

  const widgetItems = useMemo(() =>
    widgets.filter((w) => !suggestedIds.has(w.id)),
    [widgets, suggestedIds]
  )

  if (!open) return null

  return (
    <div
      style={{
        width: '550px',
        height: '328px',
        background: 'transparent',
        position: 'relative',
        pointerEvents: 'none'
      }}
    >
      {/* Command Palette */}
      <Command
        className="h-[328px] w-[270px]"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          pointerEvents: 'auto'
        }}
      >
        <CommandInput
          ref={inputRef}
          placeholder="search..."
          value={query}
          onValueChange={setQuery}
          autoFocus
        />

        <CommandList>
          <CommandEmpty>
            <Button variant="link">request widget</Button>
          </CommandEmpty>

          {/* ---- Suggested ---- */}
          {suggestedItems.length > 0 && (
            <CommandGroup>
              <div cmdk-group-heading="">suggested</div>
              {suggestedItems.map((s) => {
                if (s.type === "widget") {
                  return (
                    <CommandItem
                      key={s.id}
                      onSelect={() => handleOpenWidget(s.id)}
                      className="cursor-pointer"
                    >
                      {getIcon(s.label, s.type)}
                      <span>{s.label}</span>
                    </CommandItem>
                  )
                } else {
                  // Action with Popover
                  return (
                    <Popover key={s.id} open={popoverOpen && selectedActionId === s.id}>
                      <PopoverTrigger asChild>
                        <CommandItem
                          ref={(el) => {
                            if (el) actionRefs.current[s.id] = el
                          }}
                          value={s.id}
                          onSelect={(value) => {
                            const element = actionRefs.current[s.id]
                            if (element) {
                              handleExecuteAction(s.id, element)
                            }
                          }}
                          className={`cursor-pointer ${selectedActionId === s.id ? 'bg-ink-200' : ''}`}
                          data-action-id={s.id}
                        >
                          <CornerDownRight className="w-4 h-4" />
                          <span>{s.label}</span>
                        </CommandItem>
                      </PopoverTrigger>
                      <PopoverContent
                        side={isNearRightEdge ? "left" : "right"}
                        align="center"
                        className={`w-auto max-w-[250px] ${popoverIsError ? 'border-red-500 bg-red-50' : ''}`}
                        style={{ pointerEvents: 'auto' }}
                      >
                        <div className={`body text-sm ${popoverIsError ? 'text-red-600' : ''}`}>
                          {popoverContent}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )
                }
              })}
            </CommandGroup>
          )}

          {(suggestedItems.length > 0 && widgetItems.length > 0) && (
            <CommandSeparator />
          )}

          {/* ---- Widgets ---- */}
          {widgetItems.length > 0 && (
            <CommandGroup>
              <div cmdk-group-heading="">widgets</div>
              {widgetItems.map((w) => (
                <CommandItem
                  key={w.id}
                  onSelect={() => handleOpenWidget(w.id)}
                  className="cursor-pointer"
                >
                  {getIcon(w.label, "widget")}
                  <span>{w.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(widgetItems.length > 0 && actionItems.length > 0) && (
            <CommandSeparator />
          )}

          {/* ---- Actions ---- */}
          {actionItems.length > 0 && (
            <CommandGroup>
              <div cmdk-group-heading="">actions</div>
              {actionItems.map((a) => (
                <Popover key={a.id} open={popoverOpen && selectedActionId === a.id}>
                  <PopoverTrigger asChild>
                    <CommandItem
                      ref={(el) => {
                        if (el) actionRefs.current[a.id] = el
                      }}
                      value={a.id}
                      onSelect={(value) => {
                        const element = actionRefs.current[a.id]
                        if (element) {
                          handleExecuteAction(a.id, element)
                        }
                      }}
                      className={`cursor-pointer ${selectedActionId === a.id ? 'bg-ink-200' : ''}`}
                      data-action-id={a.id}
                    >
                      <CornerDownRight className="w-4 h-4" />
                      <span>{a.label}</span>
                    </CommandItem>
                  </PopoverTrigger>
                  <PopoverContent
                    side={isNearRightEdge ? "left" : "right"}
                    align="center"
                    className={`w-auto max-w-[250px] ${popoverIsError ? 'border-red-500 bg-red-50' : ''}`}
                    style={{ pointerEvents: 'auto' }}
                  >
                    <div className={`body text-sm ${popoverIsError ? 'text-red-600' : ''}`}>
                      {popoverContent}
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </CommandGroup>
          )}

          <CommandItem className="text-ink-700 border-t font-serif rounded-none text-lg italic">
            by nullab
          </CommandItem>
        </CommandList>
      </Command>
    </div>
  )
}