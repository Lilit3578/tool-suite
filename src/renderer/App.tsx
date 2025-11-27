// src/renderer/App.tsx
import React, { useState, useEffect } from 'react'
import CommandPalette from './components/widgets/CommandPalette'
import TranslatorWidget from './components/widgets/Translator'
import CurrencyConverterWidget from './components/widgets/CurrencyConverter'
import ClipboardHistoryWidget from './components/widgets/ClipboardHistory'
import { ErrorBoundary } from './components/ErrorBoundary'

type ComponentType = 'palette' | 'translator' | 'currency-converter' | 'clipboard-history'

interface ComponentProps {
  [key: string]: any
}

export default function App() {
  const [componentType, setComponentType] = useState<ComponentType>('palette')
  const [componentProps, setComponentProps] = useState<ComponentProps>({})

  useEffect(() => {
    // Primary: Listen for component-init IPC message (preferred method)
    const componentInitHandler = (_event: any, data: { type: string; props?: any }) => {
      console.log('App: component-init received', data)
      const type = data.type as ComponentType
      // Ignore action-popover - it's now embedded in CommandPalette
      if (type === 'palette' || type === 'translator' || type === 'currency-converter' || type === 'clipboard-history') {
        setComponentType(type)
        setComponentProps(data.props || {})
      }
    }
    
    // Store cleanup functions for IPC listeners
    const cleanupFunctions: Array<() => void> = []
    
    if (window.electronAPI?.onComponentInit) {
      const cleanup = window.electronAPI.onComponentInit(componentInitHandler)
      if (typeof cleanup === 'function') {
        cleanupFunctions.push(cleanup)
      }
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
    const paletteOpenedHandler = (_event: any, data?: any) => {
      console.log('App: palette-opened event received (legacy)')
      setComponentType('palette')
      if (data?.capturedText) {
        setComponentProps({ capturedText: data.capturedText })
      }
    }
    
    // Legacy: Listen for translator-init event (backward compatibility)
    const translatorInitHandler = (_event: any, data?: any) => {
      console.log('App: translator-init event received (legacy)')
      setComponentType('translator')
      if (data?.selectedText) {
        setComponentProps({ selectedText: data.selectedText })
      }
    }
    
    // Legacy: Listen for currency-converter-init event (backward compatibility)
    const currencyConverterInitHandler = (_event: any, data?: any) => {
      console.log('App: currency-converter-init event received (legacy)')
      setComponentType('currency-converter')
      if (data?.conversionRate) {
        setComponentProps({ conversionRate: data.conversionRate })
      }
    }
    
    if (window.electronAPI?.onPaletteOpened) {
      const cleanup = window.electronAPI.onPaletteOpened(paletteOpenedHandler)
      if (typeof cleanup === 'function') {
        cleanupFunctions.push(cleanup)
      }
    }
    if (window.electronAPI?.onTranslatorInit) {
      const cleanup = window.electronAPI.onTranslatorInit(translatorInitHandler)
      if (typeof cleanup === 'function') {
        cleanupFunctions.push(cleanup)
      }
    }
    if (window.electronAPI?.onCurrencyConverterInit) {
      const cleanup = window.electronAPI.onCurrencyConverterInit(currencyConverterInitHandler)
      if (typeof cleanup === 'function') {
        cleanupFunctions.push(cleanup)
      }
    }

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('hashchange', handleHashChange)
      // Clean up all IPC listeners
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [])

  // Wrap in a transparent container and render the appropriate component
  return (
    <ErrorBoundary>
      <div style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        overflow: 'hidden'
      }}>
        {componentType === 'translator' ? (
          <ErrorBoundary>
            <TranslatorWidget {...componentProps} />
          </ErrorBoundary>
        ) : componentType === 'currency-converter' ? (
          <ErrorBoundary>
            <CurrencyConverterWidget {...componentProps} />
          </ErrorBoundary>
        ) : componentType === 'clipboard-history' ? (
          <ErrorBoundary>
            <ClipboardHistoryWidget {...componentProps} />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary>
            <CommandPalette {...componentProps} />
          </ErrorBoundary>
        )}
      </div>
    </ErrorBoundary>
  )
}
