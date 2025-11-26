// src/main/widgets/currency-converter.ts
import { Widget } from '../types'
import { createLogger } from '../utils/logger'
import { settingsManager } from '../core/settings/settings-manager'

const logger = createLogger('CurrencyConverter')

interface ConversionResult {
  success: boolean
  rate?: number
  result?: number
  error?: string
}

interface Currency {
  code: string
  name: string
  symbol: string
  pattern: RegExp
}

const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', pattern: /\$|USD/i },
  { code: 'EUR', name: 'Euro', symbol: '€', pattern: /€|EUR/i },
  { code: 'GBP', name: 'British Pound', symbol: '£', pattern: /£|GBP/i },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', pattern: /¥|JPY/i },
  { code: 'KRW', name: 'Korean Won', symbol: '₩', pattern: /₩|KRW/i },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', pattern: /A\$|AUD/i },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', pattern: /C\$|CAD/i },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', pattern: /CHF/i },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', pattern: /CNY|RMB/i },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', pattern: /₹|INR/i },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', pattern: /MXN/i },
]

export class CurrencyConverter implements Widget {
  id = 'currency-converter'
  label = 'Currency Converter'
  icon = 'dollar-sign'
  keywords = ['currency', 'convert', 'money', 'exchange', 'forex', 'cu']
  tags = ['utility', 'finance']
  componentType = 'currency-converter'
  windowOptions = {
    width: 450,
    height: 400,  // Reduced from 520 to hug content
    transparent: false,
    backgroundColor: '#f9fafb', // gray-50
    frame: false,
    alwaysOnTop: true,
    resizable: false,  // Fixed size
    skipTaskbar: true,
    blurDelay: 200,
  }

  actions = [
    { id: 'convert-aud', label: 'Convert to Australian Dollar (AUD)', keywords: ['australian', 'dollar', 'aud', 'australia', 'a$'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'AUD') },
    { id: 'convert-gbp', label: 'Convert to British Pound (GBP)', keywords: ['british', 'pound', 'gbp', 'uk', 'sterling', '£'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'GBP') },
    { id: 'convert-cad', label: 'Convert to Canadian Dollar (CAD)', keywords: ['canadian', 'dollar', 'cad', 'canada', 'c$'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'CAD') },
    { id: 'convert-cny', label: 'Convert to Chinese Yuan (CNY)', keywords: ['chinese', 'yuan', 'cny', 'china', 'rmb'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'CNY') },
    { id: 'convert-eur', label: 'Convert to Euro (EUR)', keywords: ['euro', 'eur', 'europe', 'european', '€'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'EUR') },
    { id: 'convert-inr', label: 'Convert to Indian Rupee (INR)', keywords: ['indian', 'rupee', 'inr', 'india', '₹'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'INR') },
    { id: 'convert-jpy', label: 'Convert to Japanese Yen (JPY)', keywords: ['japanese', 'yen', 'jpy', 'japan', '¥'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'JPY') },
    { id: 'convert-mxn', label: 'Convert to Mexican Peso (MXN)', keywords: ['mexican', 'peso', 'mxn', 'mexico'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'MXN') },
    { id: 'convert-chf', label: 'Convert to Swiss Franc (CHF)', keywords: ['swiss', 'franc', 'chf', 'switzerland'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'CHF') },
    { id: 'convert-usd', label: 'Convert to US Dollar (USD)', keywords: ['us', 'dollar', 'usd', 'usa', 'america', '$'], tags: ['currency', 'conversion'], handler: (t?: string) => this.quickConvert(t, 'USD') },
  ]


  constructor(private manager?: any) { }

  async initialize() {
    // Set default currency preferences if not present
    const defaultFrom = settingsManager.get('currencyDefaultFrom')
    const defaultTo = settingsManager.get('currencyDefaultTo')

    if (!defaultFrom) {
      settingsManager.set('currencyDefaultFrom', 'USD')
    }
    if (!defaultTo) {
      settingsManager.set('currencyDefaultTo', 'EUR')
    }
  }

  async show(selectedText?: string) {
    // Parse selected text to extract amount and currency
    const parsed = this.parseAmountAndCurrency(selectedText || '')

    // Return props for the widget window
    // This method is called by WidgetManager.openWidgetWindow to get additional props
    return {
      selectedText,
      detectedAmount: parsed.amount,
      detectedCurrency: parsed.currency,
    }
  }

  detectCurrency(text: string): string | null {
    for (const currency of CURRENCIES) {
      if (currency.pattern.test(text)) {
        return currency.code
      }
    }
    return null
  }

  parseAmountAndCurrency(text: string): { amount: number | null; currency: string | null } {
    const currency = this.detectCurrency(text)

    // Remove all currency symbols and codes
    let cleanText = text
    for (const curr of CURRENCIES) {
      cleanText = cleanText.replace(curr.pattern, '')
    }

    // Remove thousand separators (commas, spaces) but keep k/m suffixes
    cleanText = cleanText.replace(/,/g, '').replace(/\s+/g, '')

    // Try parsing with shorthand support (15k, 1m, 2.5k, etc.)
    const shorthandMatch = cleanText.match(/^([0-9.]+)([km])$/i)
    let parsedAmount: number | null = null

    if (shorthandMatch) {
      const [, numStr, suffix] = shorthandMatch
      const baseNum = parseFloat(numStr)
      if (!isNaN(baseNum)) {
        if (suffix.toLowerCase() === 'k') {
          parsedAmount = baseNum * 1000
        } else if (suffix.toLowerCase() === 'm') {
          parsedAmount = baseNum * 1000000
        }
      }
    } else {
      // Fallback to regular float parsing
      const amount = parseFloat(cleanText)
      parsedAmount = isNaN(amount) ? null : amount
    }

    logger.info('Parsed text:', { original: text, currency, amount: parsedAmount })

    return { amount: parsedAmount, currency }
  }

  async quickConvert(text: string | undefined, targetCurrency: string): Promise<any> {
    const input = (text || '').trim()
    if (!input) {
      return { success: false, error: 'No text provided' }
    }

    const parsed = this.parseAmountAndCurrency(input)

    if (parsed.amount === null) {
      return { success: false, error: 'Could not parse amount from text' }
    }

    if (!parsed.currency) {
      return { success: false, error: 'Could not detect source currency' }
    }

    try {
      const conversionResult = await this.convertCurrency(
        parsed.currency,
        targetCurrency,
        parsed.amount
      )

      if (conversionResult.success) {
        // Format result with thousand separators for readability
        const formattedInput = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(parsed.amount)

        const formattedResult = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(conversionResult.result || 0)

        const formatted = `${formattedInput} ${parsed.currency} = ${formattedResult} ${targetCurrency} (Rate: ${conversionResult.rate?.toFixed(4)})`

        return { success: true, result: formatted }
      } else {
        return conversionResult
      }
    } catch (err) {
      logger.error('quickConvert error', err)
      return { success: false, error: String(err) }
    }
  }

  async convertCurrency(from: string, to: string, amount: number): Promise<ConversionResult> {
    // Same currency conversion
    if (from === to) {
      return { success: true, rate: 1, result: amount }
    }

    const apiKey = process.env.EXCHANGE_RATE_API_KEY
    if (!apiKey) {
      logger.error('Missing EXCHANGE_RATE_API_KEY')
      return { success: false, error: 'Missing EXCHANGE_RATE_API_KEY' }
    }

    try {
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}/${amount}`
      logger.info('Fetching exchange rate:', url.replace(apiKey, '***'))

      const res = await fetch(url)
      const data = await res.json()

      if (data.result === 'success') {
        const rate = data.conversion_rate
        const result = data.conversion_result

        logger.info('Conversion successful:', { from, to, amount, rate, result })
        return { success: true, rate, result }
      } else {
        logger.error('API error:', data)
        return { success: false, error: data['error-type'] || 'Unknown error' }
      }
    } catch (err) {
      logger.error('convertCurrency error', err)
      return { success: false, error: String(err) }
    }
  }
}

export default CurrencyConverter
