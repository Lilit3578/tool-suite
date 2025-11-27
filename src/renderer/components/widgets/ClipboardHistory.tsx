import React, { useEffect, useState, useRef } from "react"
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { Clipboard, Image } from "lucide-react"

// ===========================
// Types
// ===========================
interface ClipboardItem {
    text?: string
    image?: any
    html?: string
    rtf?: string
    timestamp: number
    preview: string
}

interface ClipboardHistoryProps {
    items?: ClipboardItem[]
}

// ===========================
// Main Component
// ===========================
export default function ClipboardHistoryWidget({ items: initialItems }: ClipboardHistoryProps) {
    const [items, setItems] = useState<ClipboardItem[]>(initialItems || [])
    const commandRef = useRef<HTMLDivElement>(null)
    const isPastingRef = useRef<boolean>(false)

    // Listen for component init
    useEffect(() => {
        const onInit = (_event: any, data: { type: string; props?: any }) => {
            if (data.type === 'clipboard-history' && data.props?.items) {
                setItems(data.props.items)
            }
        }
        const cleanup = window.electronAPI.onComponentInit?.(onInit)
        return () => {
            if (typeof cleanup === 'function') {
                cleanup()
            }
        }
    }, [])

    // Auto-focus the component when it mounts and notify window to resize
    useEffect(() => {
        // Focus the command component after a short delay
        const timer = setTimeout(() => {
            if (commandRef.current) {
                commandRef.current.focus()
            }
            // Also try to focus the first input/button
            const firstFocusable = document.querySelector('input, button, [tabindex="0"]') as HTMLElement
            if (firstFocusable) {
                firstFocusable.focus()
            }
        }, 100)

        // Notify window to resize based on content - measure actual container exactly
        const resizeTimer = setTimeout(() => {
            if (commandRef.current && window.electronAPI?.resizeWindow) {
                const container = commandRef.current
                const rect = container.getBoundingClientRect()
                const height = Math.ceil(rect.height) // Exact height, no padding
                window.electronAPI.resizeWindow(height)
            }
        }, 200)

        return () => {
            clearTimeout(timer)
            clearTimeout(resizeTimer)
        }
    }, [items])

    // Handle item selection and auto-paste
    const handleSelect = async (timestamp: number) => {
        // Prevent multiple simultaneous paste operations
        if (isPastingRef.current) {
            console.log('Paste already in progress, ignoring duplicate request')
            return
        }

        isPastingRef.current = true
        try {
            console.log('Pasting clipboard item:', timestamp)
            // Paste will automatically close the window (handled by IPC handler)
            await window.electronAPI.pasteClipboardItem(timestamp.toString())
        } catch (error) {
            console.error('Error pasting clipboard item:', error)
        } finally {
            // Reset flag after a delay to allow paste operation to complete
            setTimeout(() => {
                isPastingRef.current = false
            }, 500) // Reduced from 2000ms to 500ms for faster response
        }
    }

    // Keyboard shortcuts: 1-5 and Enter
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Prevent handling if paste is already in progress
            if (isPastingRef.current) {
                return
            }

            // Handle numeric shortcuts 1-5
            const num = parseInt(e.key, 10)
            if (num >= 1 && num <= 5 && items[num - 1]) {
                e.preventDefault()
                e.stopPropagation()
                handleSelect(items[num - 1].timestamp)
                return
            }

            // Handle Enter key on focused item
            if (e.key === 'Enter') {
                // Get the currently selected/focused item
                const selectedElement = document.querySelector('[data-selected="true"]') as HTMLElement
                if (selectedElement) {
                    const timestampAttr = selectedElement.getAttribute('data-timestamp')
                    if (timestampAttr) {
                        e.preventDefault()
                        e.stopPropagation()
                        handleSelect(parseInt(timestampAttr, 10))
                    }
                }
            }
        }

        // Add event listener to window for global keyboard handling
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [items])

    if (items.length === 0) {
        return (
            <Command
                ref={commandRef}
                data-clipboard-container
                className="p-4 text-center text-muted-foreground"
            >
                No clipboard history yet
            </Command>
        )
    }

    return (
        <Command
            ref={commandRef}
            tabIndex={0}
            data-clipboard-container
            className="p-0 m-0 h-auto"
        >
            <CommandList className="overflow-visible">
                <CommandGroup heading="Recent Clipboard (1-5)">
                    {items.map((item, index) => (
                        <CommandItem
                            key={item.timestamp}
                            onSelect={() => {
                                handleSelect(item.timestamp)
                            }}
                            className="cursor-pointer"
                            data-timestamp={item.timestamp}
                            title={item.text || item.preview}
                        >
                            {index + 1}
                            {item.image ? (
                                <Image className="w-4 h-4 mr-2" />
                            ) : (
                                <Clipboard className="w-4 h-4 mr-2" />
                            )}
                            <span className="truncate flex-1">{item.preview}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    )
}
