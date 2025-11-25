// src/renderer/App.tsx
import React, { useState, useEffect } from 'react'
import CommandPalette from './components/widgets/CommandPalette'
import TranslatorWidget from './components/widgets/Translator'
import CurrencyConverterWidget from './components/widgets/CurrencyConverter'
import ClipboardHistoryWidget from './components/widgets/ClipboardHistory'

type ComponentType = 'palette' | 'translator' | 'currency-converter' | 'clipboard-history'

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
        // Ignore action-popover - it's now embedded in CommandPalette
        if (type === 'palette' || type === 'translator' || type === 'currency-converter' || type === 'clipboard-history') {
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
      } else if (hash === '#currency-converter') {
        setComponentType('currency-converter')
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

    // Legacy: Listen for currency-converter-init event (backward compatibility)
    if (window.electronAPI?.onCurrencyConverterInit) {
      window.electronAPI.onCurrencyConverterInit((_event: any, data?: any) => {
        console.log('App: currency-converter-init event received (legacy)')
        setComponentType('currency-converter')
        if (data?.conversionRate) {
          setComponentProps({ conversionRate: data.conversionRate })
        }
      })
    }

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  // Wrap in a transparent container and render the appropriate component
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'transparent',
      overflow: 'hidden'
    }}>
      {componentType === 'translator' ? (
        <TranslatorWidget {...componentProps} />
      ) : componentType === 'currency-converter' ? (
        <CurrencyConverterWidget {...componentProps} />
      ) : componentType === 'clipboard-history' ? (
        <ClipboardHistoryWidget {...componentProps} />
      ) : (
        <CommandPalette {...componentProps} />
      )}
    </div>
  )
}
