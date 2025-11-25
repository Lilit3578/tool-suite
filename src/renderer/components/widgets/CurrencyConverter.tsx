// src/renderer/components/CurrencyConverterWidget.tsx
import React, { useEffect, useState, useRef } from "react"
import { Card } from "../ui/card"
import { Separator } from "../ui/separator"
import { Textarea } from "../ui/textarea"
import { Combobox } from "../ui/combobox"
import { Button } from "../ui/button"
import { ArrowDownUp } from 'lucide-react'

declare global {
  interface Window {
    electronAPI: any
  }
}

const CURRENCIES: Record<string, string> = {
  USD: 'US Dollar ($)',
  EUR: 'Euro (€)',
  GBP: 'British Pound (£)',
  JPY: 'Japanese Yen (¥)',
  AUD: 'Australian Dollar (A$)',
  CAD: 'Canadian Dollar (C$)',
  CHF: 'Swiss Franc (CHF)',
  CNY: 'Chinese Yuan (¥)',
  INR: 'Indian Rupee (₹)',
  MXN: 'Mexican Peso ($)',
  KRW: 'South Korean Won (₩)',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF',
  CNY: '¥',
  INR: '₹',
  MXN: '$',
  KRW: '₩',
}

interface CurrencyConverterWidgetProps {
  selectedText?: string
  detectedAmount?: number
  detectedCurrency?: string
}

// Helper function to parse amount from text (extract numbers)
function parseAmountFromText(text: string): number | null {
  if (!text || !text.trim()) return null

  // Remove currency symbols and codes
  const currencyPatterns = [
    /\$|USD/i, /€|EUR/i, /£|GBP/i, /¥|JPY/i,
    /A\$|AUD/i, /C\$|CAD/i, /CHF/i, /CNY|RMB/i,
    /₹|INR/i, /MXN/i, /₩|KRW/i,
  ]

  let cleanText = text
  for (const pattern of currencyPatterns) {
    cleanText = cleanText.replace(pattern, '')
  }

  // Remove thousand separators (commas, spaces)
  cleanText = cleanText.replace(/,/g, '').replace(/\s+/g, '')

  // Parse as float
  const amount = parseFloat(cleanText)
  return isNaN(amount) ? null : amount
}

export default function CurrencyConverterWidget(props?: CurrencyConverterWidgetProps) {
  const [amount, setAmount] = useState("")
  const [fromCurrency, setFromCurrency] = useState("USD")
  const [toCurrency, setToCurrency] = useState("EUR")
  const [result, setResult] = useState<number | null>(null)
  const [rate, setRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize from props - run once on mount or when props change
  useEffect(() => {
    console.log('CurrencyConverter: Initializing from props', {
      detectedAmount: props?.detectedAmount,
      detectedCurrency: props?.detectedCurrency,
      selectedText: props?.selectedText
    })

    // Set amount - prefer detectedAmount over parsing selectedText
    if (props?.detectedAmount !== undefined && props?.detectedAmount !== null) {
      console.log('CurrencyConverter: Setting amount from detectedAmount:', props.detectedAmount)
      setAmount(String(props.detectedAmount))
    } else if (props?.selectedText) {
      console.log('CurrencyConverter: Parsing amount from selectedText:', props.selectedText)
      const parsedAmount = parseAmountFromText(props.selectedText)
      if (parsedAmount !== null) {
        setAmount(String(parsedAmount))
      }
    }

    // Set currencies
    const initializeCurrencies = async () => {
      try {
        // Load saved preferences
        let defaultFrom = 'USD'
        let defaultTo = 'EUR'

        if (window.electronAPI?.getCurrencySettings) {
          const settings = await window.electronAPI.getCurrencySettings()
          defaultFrom = settings.defaultFrom || 'USD'
          defaultTo = settings.defaultTo || 'EUR'
        }

        // Set from currency - prefer detected over default
        if (props?.detectedCurrency) {
          console.log('CurrencyConverter: Setting fromCurrency from detectedCurrency:', props.detectedCurrency)
          setFromCurrency(props.detectedCurrency)
        } else {
          setFromCurrency(defaultFrom)
        }

        // Set to currency from settings
        setToCurrency(defaultTo)
      } catch (err) {
        console.error('Error initializing currency converter:', err)
      }
    }

    initializeCurrencies()
  }, [props?.detectedAmount, props?.detectedCurrency, props?.selectedText])

  // Auto-convert with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      const numAmount = parseFloat(amount)

      // Clear result if amount is invalid
      if (!amount.trim() || isNaN(numAmount)) {
        setResult(null)
        setRate(null)
        setError("")
        return
      }

      // Same currency conversion
      if (fromCurrency === toCurrency) {
        setResult(numAmount)
        setRate(1)
        setError("")
        return
      }

      // Call API for conversion
      convertCurrency(fromCurrency, toCurrency, numAmount)
    }, 500)

    return () => clearTimeout(timeout)
  }, [amount, fromCurrency, toCurrency])

  // Save settings when currencies change
  useEffect(() => {
    if (window.electronAPI?.saveCurrencySettings) {
      window.electronAPI.saveCurrencySettings({
        defaultFrom: fromCurrency,
        defaultTo: toCurrency,
      }).catch((err: any) => console.error("Error saving settings:", err))
    }
  }, [fromCurrency, toCurrency])

  // Auto-size window height to hug content
  useEffect(() => {
    if (!containerRef.current) return

    const resizeWindow = () => {
      if (containerRef.current && window.electronAPI?.resizeWindow) {
        const height = containerRef.current.scrollHeight
        // Add padding (20px top + 20px bottom)
        const newHeight = Math.max(height + 40, 200) // Minimum 200px
        console.log('CurrencyConverter: Resizing window', {
          scrollHeight: height,
          newHeight,
          currentAmount: amount,
          hasResult: result !== null
        })
        window.electronAPI.resizeWindow(newHeight)
      }
    }

    // Initial resize with delay to ensure content is rendered
    const timeoutId = setTimeout(resizeWindow, 150)

    // Use ResizeObserver to watch for content changes
    const resizeObserver = new ResizeObserver(() => {
      console.log('CurrencyConverter: ResizeObserver triggered')
      resizeWindow()
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [amount, result, loading, error])

  async function convertCurrency(from: string, to: string, amt: number) {
    setLoading(true)
    setError("")

    try {
      const res = await window.electronAPI.convertCurrency({
        from,
        to,
        amount: amt,
      })

      if (res.success) {
        setResult(res.result)
        setRate(res.rate)
      } else {
        setError(res.error || "Conversion failed")
        setResult(null)
        setRate(null)
      }
    } catch (err) {
      setError(String(err))
      setResult(null)
      setRate(null)
    } finally {
      setLoading(false)
    }
  }

  function swapCurrencies() {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }

  return (
    <Card
      ref={containerRef}
      className="w-full bg-ink-0 border border-ink-400 rounded-xl p-4 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="font-serif italic text-[20px] leading-7 text-ink-1000">
          currency <span className="not-italic"> </span> converter
        </h2>
      </div>

      <Separator className="bg-ink-200" />

      {/* FROM ROW — matches screenshot */}
      <div
        className="flex items-center gap-3 w-full bg-ink-0 border border-ink-400 rounded-lg 
        px-2 py-2"
      >
        {/* Currency pill */}
        <div
          className="px-2 py-1 bg-ink-1000 text-ink-0 rounded-md border border-ink-400
          flex items-center gap-1 text-sm font-normal"
        >
          <Combobox
            value={CURRENCIES[fromCurrency]}
            onChange={(val) => {
              const code = Object.keys(CURRENCIES).find(k => CURRENCIES[k] === val)
              if (code) setFromCurrency(code)
            }}
            items={Object.values(CURRENCIES)}
            placeholder="Select currency"
            className="w-[120px] text-ink-0"
          />
        </div>

        {/* Editable numeric input — RIGHT aligned */}
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 text-right bg-transparent border-none outline-none
          text-[14px] font-normal text-ink-1000"
          placeholder="0.00"
        />
      </div>

      {/* TO ROW — now also editable, like screenshot */}
      <div
        className="flex items-center gap-3 w-full border border-ink-400 rounded-lg 
        px-2 py-2"
      >
        {/* Currency pill */}
        <div
          className="px-2 py-1 bg-ink-1000 text-ink-0 rounded-md border border-ink-400
          flex items-center gap-1 text-sm font-normal"
        >
          <Combobox
            value={CURRENCIES[toCurrency]}
            onChange={(val) => {
              const code = Object.keys(CURRENCIES).find(k => CURRENCIES[k] === val)
              if (code) setToCurrency(code)
            }}
            items={Object.values(CURRENCIES)}
            placeholder="Select currency"
            className="w-[120px] text-ink-0"
          />
        </div>

        {/* Second editable input */}
        <input
          type="text"
          value={result !== null ? result.toFixed(2) : ""}
          onChange={(e) => {
            const v = e.target.value
            // reverse convert when user edits the 'to' field
            if (!v.trim() || isNaN(parseFloat(v))) {
              setResult(null)
              return
            }
            const num = parseFloat(v)
            if (rate) {
              // reverse direction: to → from
              setAmount((num / rate).toString())
            }
          }}
          className="flex-1 text-right bg-transparent border-none outline-none
          text-[14px] font-normal text-ink-1000"
          placeholder="0.00"
        />
      </div>

      <Separator className="bg-ink-200" />

      {/* Footer */}
      <div className="text-right text-ink-700 font-serif italic text-[20px] leading-7">
        by nullab
      </div>
    </Card>
  )
}
