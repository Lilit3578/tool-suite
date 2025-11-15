// src/main/widgets/text-translator.ts
import { Widget } from '../types'
import { createLogger } from '../logger'
import { settingsManager } from '../settings-manager'

const logger = createLogger('TextTranslator')

export class TextTranslator implements Widget {
  id = 'translator'
  label = 'Translator'
  icon = 'globe'
  componentType = 'translator'
  windowOptions = {
    width: 480,
    height: 540,
    transparent: false,
    backgroundColor: '#f9fafb', // gray-50
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    blurDelay: 200,
  }


  actions = [
    { id: 'translate-it', label: 'Translate to Italian', handler: (text?: string) => this.translate(text, 'it') },
    { id: 'translate-en', label: 'Translate to English', handler: (text?: string) => this.translate(text, 'en') },
    { id: 'translate-fr', label: 'Translate to French', handler: (text?: string) => this.translate(text, 'fr') },
    { id: 'translate-de', label: 'Translate to German', handler: (text?: string) => this.translate(text, 'de') },
    { id: 'translate-es', label: 'Translate to Spanish', handler: (text?: string) => this.translate(text, 'es') },
    // extend list...
  ]

  constructor(private manager?: any) {}

  async initialize() {
    // nothing for now
  }

  async show(selectedText?: string) {
    if (this.manager && typeof this.manager.openWidgetWindow === 'function') {
      return this.manager.openWidgetWindow(this.id, { selectedText })
    }
    return null
  }

  private async translate(text?: string, target = 'en') {
    const input = (text || '').trim()
    if (!input) return { success: false, error: 'No text provided' }

    const key = process.env.GOOGLE_TRANSLATE_API_KEY
    if (!key) {
      return { success: false, error: 'Missing GOOGLE_TRANSLATE_API_KEY' }
    }

    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${key}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: input, target }),
      })
      const data = await res.json()
      const translated = data?.data?.translations?.[0]?.translatedText
      const detected = data?.data?.translations?.[0]?.detectedSourceLanguage
      return { success: true, translatedText: translated, detectedSourceLanguage: detected }
    } catch (err) {
      logger.error('translate error', err)
      return { success: false, error: String(err) }
    }
  }
}

export default TextTranslator
