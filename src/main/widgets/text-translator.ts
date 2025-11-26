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
  icon = 'translate'
  keywords = ['translate', 'translation', 'language', 'lang']
  tags = ['utility', 'text']
  componentType = 'translator'
  windowOptions = {
    width: 500,
    height: 400,
    transparent: false,
    backgroundColor: '#ffffff',
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    blurDelay: 200,
  }


  actions = [
    { id: 'translate-ar', label: 'Translate to Arabic', keywords: ['arabic', 'arab', 'ar'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'ar') },
    { id: 'translate-zh', label: 'Translate to Chinese', keywords: ['chinese', 'china', 'zh', 'mandarin'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'zh-CN') },
    { id: 'translate-cs', label: 'Translate to Czech', keywords: ['czech', 'czechia', 'cs'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'cs') },
    { id: 'translate-da', label: 'Translate to Danish', keywords: ['danish', 'denmark', 'da'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'da') },
    { id: 'translate-nl', label: 'Translate to Dutch', keywords: ['dutch', 'netherlands', 'nl'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'nl') },
    { id: 'translate-en', label: 'Translate to English', keywords: ['english', 'en', 'uk', 'us'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'en') },
    { id: 'translate-fi', label: 'Translate to Finnish', keywords: ['finnish', 'finland', 'fi'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'fi') },
    { id: 'translate-fr', label: 'Translate to French', keywords: ['french', 'france', 'fr'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'fr') },
    { id: 'translate-de', label: 'Translate to German', keywords: ['german', 'germany', 'de'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'de') },
    { id: 'translate-el', label: 'Translate to Greek', keywords: ['greek', 'greece', 'el'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'el') },
    { id: 'translate-he', label: 'Translate to Hebrew', keywords: ['hebrew', 'israel', 'he'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'he') },
    { id: 'translate-hi', label: 'Translate to Hindi', keywords: ['hindi', 'india', 'hi'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'hi') },
    { id: 'translate-id', label: 'Translate to Indonesian', keywords: ['indonesian', 'indonesia', 'id'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'id') },
    { id: 'translate-it', label: 'Translate to Italian', keywords: ['italian', 'italy', 'it', 'ita', 'italiano'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'it') },
    { id: 'translate-ja', label: 'Translate to Japanese', keywords: ['japanese', 'japan', 'ja'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'ja') },
    { id: 'translate-ko', label: 'Translate to Korean', keywords: ['korean', 'korea', 'ko'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'ko') },
    { id: 'translate-no', label: 'Translate to Norwegian', keywords: ['norwegian', 'norway', 'no'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'no') },
    { id: 'translate-pl', label: 'Translate to Polish', keywords: ['polish', 'poland', 'pl'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'pl') },
    { id: 'translate-pt', label: 'Translate to Portuguese', keywords: ['portuguese', 'portugal', 'brazil', 'pt'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'pt') },
    { id: 'translate-ru', label: 'Translate to Russian', keywords: ['russian', 'russia', 'ru'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'ru') },
    { id: 'translate-es', label: 'Translate to Spanish', keywords: ['spanish', 'spain', 'es'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'es') },
    { id: 'translate-sv', label: 'Translate to Swedish', keywords: ['swedish', 'sweden', 'sv'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'sv') },
    { id: 'translate-th', label: 'Translate to Thai', keywords: ['thai', 'thailand', 'th'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'th') },
    { id: 'translate-tr', label: 'Translate to Turkish', keywords: ['turkish', 'turkey', 'tr'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'tr') },
    { id: 'translate-vi', label: 'Translate to Vietnamese', keywords: ['vietnamese', 'vietnam', 'vi'], tags: ['translation', 'language'], handler: (t?: string) => this.quickTranslate(t, 'vi') },
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
