// src/renderer/App.tsx
import React, { useState, useEffect } from 'react'
import CommandPalette from './components/CommandPalette'
import TranslatorWidget from './components/TranslatorWidget'
import ActionPopover from './components/ActionPopover'

type ComponentType = 'palette' | 'translator' | 'action-popover'

interface ComponentProps {
  [key: string]: any
}

export default function App() {
  const [componentType, setComponentType] = useState<ComponentType>('palette')
  const [componentProps, setComponentProps] = useState<ComponentProps>({})

  useEffect(() => {
    // Primary: Listen for component-init IPC message (preferred method)
    if (window.electronAPI?.onComponentInit) {
      const handler = (_event: any, data: { type: string; props?: any }) => {
        console.log('App: component-init received', data)
        const type = data.type as ComponentType
        if (type === 'palette' || type === 'translator' || type === 'action-popover') {
          setComponentType(type)
          setComponentProps(data.props || {})
        }
      }
      window.electronAPI.onComponentInit(handler)
    }

    // Fallback: Determine view based on hash (for direct URL access)
    const updateViewFromHash = () => {
      const hash = window.location.hash
      console.log('App: hash changed to', hash)
      if (hash === '#translator') {
        setComponentType('translator')
      } else if (hash === '#action-popover') {
        setComponentType('action-popover')
      } else {
        setComponentType('palette')
      }
    }

    // Initial view determination from hash
    const timeoutId = setTimeout(updateViewFromHash, 0)

    // Listen for hash changes
    const handleHashChange = () => {
      updateViewFromHash()
    }
    window.addEventListener('hashchange', handleHashChange)

    // Legacy: Listen for palette-opened event (backward compatibility)
    if (window.electronAPI?.onPaletteOpened) {
      window.electronAPI.onPaletteOpened((_event: any, data?: any) => {
        console.log('App: palette-opened event received (legacy)')
        setComponentType('palette')
        if (data?.capturedText) {
          setComponentProps({ capturedText: data.capturedText })
        }
      })
    }

    // Legacy: Listen for translator-init event (backward compatibility)
    if (window.electronAPI?.onTranslatorInit) {
      window.electronAPI.onTranslatorInit((_event: any, data?: any) => {
        console.log('App: translator-init event received (legacy)')
        setComponentType('translator')
        if (data?.selectedText) {
          setComponentProps({ selectedText: data.selectedText })
        }
      })
    }

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  // Render the appropriate component
  switch (componentType) {
    case 'translator':
      return <TranslatorWidget {...componentProps} />
    case 'action-popover':
      return <ActionPopover {...componentProps} />
    case 'palette':
    default:
      return <CommandPalette {...componentProps} />
  }
}
