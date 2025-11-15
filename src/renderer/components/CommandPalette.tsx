import React, { useEffect, useState, useRef } from "react"
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
import { ChevronDownIcon, 
  CornerDownRight, 
  Clipboard, 
  Pipette, 
  Languages, 
  BookOpen, 
  MessageSquare, 
  Globe, 
  DollarSign, 
  Ruler,
  LanguagesIcon, 
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
  const inputRef = useRef<HTMLInputElement | null>(null)
  const actionElementRefs = useRef<Record<string, HTMLElement>>({})

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
    const onShow = (_event: any, data?: { capturedText?: string }) => {
      setOpen(true)
      setSelectedActionId(null) // Clear selected action when palette opens
      if (data?.capturedText) setCapturedText(data.capturedText)
      else window.electronAPI.getCapturedText().then(setCapturedText)
    }
    window.electronAPI.onPaletteOpened?.(onShow)
  }, [])

  // Update suggestions
  useEffect(() => {
    let active = true
    const fetchSuggestions = async () => {
      const res = await window.electronAPI.getSuggestions(query || "")
      if (active) setSuggestions(res)
    }
    fetchSuggestions()
    return () => { active = false }
  }, [query])

  // Execute widget
  async function handleOpenWidget(widgetId: string) {
    try {
      const text = capturedText || await window.electronAPI.getCapturedText()
      console.log('Opening widget:', widgetId, 'with text:', text)
      const res = await window.electronAPI.openWidget(widgetId, { selectedText: text })
      console.log('Widget open result:', res)
      if (res?.success !== false) {
        setOpen(false) // Close palette when opening widget
      } else {
        console.error('Failed to open widget:', res)
      }
    } catch (error) {
      console.error('Error opening widget:', error)
    }
  }

  // Update your handleExecuteAction function in CommandPalette.tsx
  async function handleExecuteAction(actionId: string, element?: HTMLElement) {
    console.log('=== handleExecuteAction START ===')
    console.log('Action ID:', actionId)
    console.log('Element:', element)

    // Set the selected action for visual feedback
    setSelectedActionId(actionId)

    try {
      if (!window.electronAPI) {
        console.error('electronAPI not available')
        return
      }

      const text = capturedText || await window.electronAPI.getCapturedText()
      console.log('Executing action:', actionId, 'with text:', text)
      const res = await window.electronAPI.executeAction(actionId, text)
      console.log('Action result:', res)
      
      let resultText = ''
      if (res && typeof res === 'object' && res.success === true) {
        // Success case
        if (res.result?.translatedText) {
          resultText = res.result.translatedText
        } else if (typeof res.result === "string") {
          resultText = res.result
        } else if (res.result) {
          resultText = JSON.stringify(res.result)
        } else {
          resultText = 'Action completed'
        }
      } else if (res && typeof res === 'object' && res.success === false) {
        // Error case
        const errorMsg = res.error || 'Unknown error'
        resultText = `Error: ${errorMsg}`
      } else {
        // Fallback
        resultText = typeof res === 'string' ? res : `Error: ${JSON.stringify(res)}`
      }
      
      console.log('Final resultText:', resultText)

      // Calculate position for popover window
      let position = { x: 270 + 10, y: 100 } // Default fallback
      
      // Try to get element from refs if not provided
      let targetElement = element || actionElementRefs.current[actionId]
      
      if (targetElement) {
        // Get the Command component's bounding box (the entire palette window content area)
        const commandElement = targetElement.closest('[cmdk-root]')
        const commandRect = commandElement?.getBoundingClientRect()
        
        const rect = targetElement.getBoundingClientRect()
        console.log('=== POSITION DEBUG ===')
        console.log('Element rect:', {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        })
        console.log('Command (palette) rect:', commandRect)
        console.log('Window innerHeight:', window.innerHeight)
        console.log('Window innerWidth:', window.innerWidth)
        
        if (rect.width > 0 && rect.height > 0) {
          // CRITICAL: Use absolute position relative to the palette window
          // rect.top is already relative to the viewport (palette window)
          // Just need to add proper offset
          
          // Position horizontally to the right of palette (270px wide)
          const x = 270 + 10
          
          // Position vertically aligned with the action item
          // rect.top is relative to the palette window's content area
          // We need to account for any scrolling in the command list
          let y = rect.top
          
          // If there's a command element, adjust for its offset
          if (commandRect) {
            y = rect.top - commandRect.top + 40 // Add offset for search box height
          }
          
          // Center the popover vertically on the action item
          y = y + (rect.height / 2) - 40 // Subtract half of popover height (80px / 2)
          
          position = { 
            x: Math.round(x),
            y: Math.round(y)
          }
          console.log('Calculated position:', position)
        } else {
          console.warn('Element has zero dimensions, using fallback')
        }
      } else {
        console.warn('No element found, using fallback position')
      }

      console.log('Final position being sent:', position)

      // Show popover in separate window
      const popoverResult = await window.electronAPI.showActionPopover(resultText, position)
      console.log('showActionPopover result:', popoverResult)
      console.log('=== handleExecuteAction END ===')
    } catch (error) {
      console.error('=== ERROR in handleExecuteAction ===')
      console.error('Error:', error)
      const errorText = `Error: ${String(error)}`
      
      // Show error in popover at fallback position
      if (window.electronAPI) {
        try {
          await window.electronAPI.showActionPopover(errorText, { x: 280, y: 100 })
        } catch (popoverError) {
          console.error('Failed to show error popover:', popoverError)
        }
      }
      console.log('=== ERROR HANDLING END ===')
    }
  }

  const suggestedItems = suggestions.slice(0, 4)
  const actionItems = suggestions.filter((s) => s.type === "action")

  if (!open) return null

  return (
    <Command className="h-[328px]">
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
                // Action - opens popover in separate window
                return (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    ref={(el) => {
                      if (el) {
                        actionElementRefs.current[s.id] = el
                      }
                    }}
                    onSelect={async (value) => {
                      console.log('CommandItem onSelect fired for suggested action:', value)
                      // Use setTimeout to ensure ref is set
                      setTimeout(() => {
                        const element = actionElementRefs.current[s.id]
                        console.log('Element from ref for suggested action:', element)
                        if (element) {
                          handleExecuteAction(s.id, element)
                        } else {
                          // Fallback: execute without element
                          console.warn('Element ref not found, executing without element')
                          handleExecuteAction(s.id)
                        }
                      }, 0)
                    }}
                    className={`cursor-pointer ${selectedActionId === s.id ? 'bg-ink-200' : ''}`}
                    data-selected={selectedActionId === s.id}
                  >
                    <CornerDownRight />
                    <span>{s.label}</span>
                  </CommandItem>
                )
              }
            })}
          </CommandGroup>
        )}

        {(suggestedItems.length > 0 && widgets.length > 0) && (
          <CommandSeparator />
        )}

        {/* ---- Widgets ---- */}
        {widgets.length > 0 && (
          <CommandGroup>
            <div cmdk-group-heading="">widgets</div>
            {widgets.map((w) => (
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

        {(widgets.length > 0 && actionItems.length > 0) && (
          <CommandSeparator />
        )}

        {/* ---- Actions ---- */}
        {actionItems.length > 0 && (
          <CommandGroup>
            <div cmdk-group-heading="">actions</div>
            {actionItems.map((a) => (
              <CommandItem
                key={a.id}
                value={a.id}
                ref={(el) => {
                  if (el) {
                    actionElementRefs.current[a.id] = el
                  }
                }}
                onSelect={async (value) => {
                  console.log('CommandItem onSelect fired for action:', value)
                  // Use setTimeout to ensure ref is set
                  setTimeout(() => {
                    const element = actionElementRefs.current[a.id]
                    console.log('Element from ref for action:', element)
                    if (element) {
                      handleExecuteAction(a.id, element)
                    } else {
                      // Fallback: execute without element
                      console.warn('Element ref not found, executing without element')
                      handleExecuteAction(a.id)
                    }
                  }, 0)
                }}
                className={`cursor-pointer ${selectedActionId === a.id ? 'bg-ink-200' : ''}`}
                data-selected={selectedActionId === a.id}
              >
                <CornerDownRight />
                <span>{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}


        <CommandItem className="text-ink-700 border-t font-serif rounded-none text-lg italic">
          by nullab
        </CommandItem>
      </CommandList>
    </Command>
  )
}


