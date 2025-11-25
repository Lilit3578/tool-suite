// src/main/widgets/text-translator.ts
import { Widget } from '../types'
import { createLogger } from '../utils/logger'
import { settingsManager } from '../core/settings/settings-manager'
import { fetchWithRetry, RateLimiter, SimpleCache } from '../utils/network'
import { translate } from '@vitalets/google-translate-api'

const logger = createLogger('TextTranslator')

// Rate limiter: max 10 requests per second
const rateLimiter = new RateLimiter(10)

// Translation cache: 1 hour TTL
const translationCache = new SimpleCache<string>(3600000)

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
    { id: 'translate-en', label: 'Translate to English', handler: (t?: string) => this.quickTranslate(t, 'en') },
    { id: 'translate-es', label: 'Translate to Spanish', handler: (t?: string) => this.quickTranslate(t, 'es') },
    { id: 'translate-fr', label: 'Translate to French', handler: (t?: string) => this.quickTranslate(t, 'fr') },
    { id: 'translate-de', label: 'Translate to German', handler: (t?: string) => this.quickTranslate(t, 'de') },
    { id: 'translate-it', label: 'Translate to Italian', handler: (t?: string) => this.quickTranslate(t, 'it') },
    { id: 'translate-pt', label: 'Translate to Portuguese', handler: (t?: string) => this.quickTranslate(t, 'pt') },
    { id: 'translate-ru', label: 'Translate to Russian', handler: (t?: string) => this.quickTranslate(t, 'ru') },
    { id: 'translate-ja', label: 'Translate to Japanese', handler: (t?: string) => this.quickTranslate(t, 'ja') },
    { id: 'translate-ko', label: 'Translate to Korean', handler: (t?: string) => this.quickTranslate(t, 'ko') },
    { id: 'translate-zh', label: 'Translate to Chinese', handler: (t?: string) => this.quickTranslate(t, 'zh-CN') },
    { id: 'translate-ar', label: 'Translate to Arabic', handler: (t?: string) => this.quickTranslate(t, 'ar') },
    { id: 'translate-hi', label: 'Translate to Hindi', handler: (t?: string) => this.quickTranslate(t, 'hi') },
    { id: 'translate-tr', label: 'Translate to Turkish', handler: (t?: string) => this.quickTranslate(t, 'tr') },
    { id: 'translate-nl', label: 'Translate to Dutch', handler: (t?: string) => this.quickTranslate(t, 'nl') },
    { id: 'translate-pl', label: 'Translate to Polish', handler: (t?: string) => this.quickTranslate(t, 'pl') },
    { id: 'translate-sv', label: 'Translate to Swedish', handler: (t?: string) => this.quickTranslate(t, 'sv') },
    { id: 'translate-da', label: 'Translate to Danish', handler: (t?: string) => this.quickTranslate(t, 'da') },
    { id: 'translate-no', label: 'Translate to Norwegian', handler: (t?: string) => this.quickTranslate(t, 'no') },
    { id: 'translate-fi', label: 'Translate to Finnish', handler: (t?: string) => this.quickTranslate(t, 'fi') },
    { id: 'translate-cs', label: 'Translate to Czech', handler: (t?: string) => this.quickTranslate(t, 'cs') },
    { id: 'translate-el', label: 'Translate to Greek', handler: (t?: string) => this.quickTranslate(t, 'el') },
    { id: 'translate-he', label: 'Translate to Hebrew', handler: (t?: string) => this.quickTranslate(t, 'he') },
    { id: 'translate-th', label: 'Translate to Thai', handler: (t?: string) => this.quickTranslate(t, 'th') },
    { id: 'translate-vi', label: 'Translate to Vietnamese', handler: (t?: string) => this.quickTranslate(t, 'vi') },
    { id: 'translate-id', label: 'Translate to Indonesian', handler: (t?: string) => this.quickTranslate(t, 'id') },
  ]


  constructor(private manager?: any) { }

  /**
   * Quick translate wrapper for action handlers
   * Handles optional text parameter and returns formatted result with detected language
   */
  private async quickTranslate(text: string | undefined, targetLang: string): Promise<{ success: boolean; result?: { translatedText: string; detectedSourceLanguage: string }; error?: string }> {
    const input = (text || '').trim()
    if (!input) {
      return { success: false, error: 'No text provided' }
    }

    try {
      const { translatedText, detectedLang } = await this.translate(input, targetLang)
      return {
        success: true,
        result: {
          translatedText,
          detectedSourceLanguage: detectedLang
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async initialize() {
    // nothing for now
  }

  async show(selectedText?: string) {
    // Return props for the widget window
    // This method is called by WidgetManager.openWidgetWindow to get additional props
    return { selectedText }
  }

  private async translate(text: string, targetLang: string): Promise<{ translatedText: string; detectedLang: string }> {
    if (!text || !text.trim()) {
      throw new Error('No text provided for translation')
    }

    // Check cache first
    const cacheKey = `${text}:${targetLang}`
    const cached = translationCache.get(cacheKey)
    if (cached) {
      logger.info('Translation cache hit')
      // For cached results, we don't have the detected language, so return 'unknown'
      return { translatedText: cached, detectedLang: 'unknown' }
    }

    try {
      // Use rate limiter to prevent API abuse
      const result = await rateLimiter.execute(async () => {
        logger.info('Translating to', targetLang)
        return await translate(text, { to: targetLang })
      })

      const translatedText = result.text
      const detectedLang = result.raw?.src || 'unknown'

      logger.info('Translation successful', {
        from: detectedLang,
        to: targetLang,
        originalLength: text.length,
        translatedLength: translatedText.length
      })

      // Cache the result
      translationCache.set(cacheKey, translatedText)

      return { translatedText, detectedLang }
    } catch (err) {
      logger.error('Translation error', err)
      throw new Error(`Translation failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

export default TextTranslator
