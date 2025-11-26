// src/renderer/components/TranslatorWidget.tsx
import React, { useEffect, useState, useRef } from "react"
import { Card } from "../ui/card"
import { Separator } from "../ui/separator"
import { Textarea } from "../ui/textarea"
import { Combobox } from "../ui/combobox"

declare global {
  interface Window {
    electronAPI: any
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "english",
  zh: "chinese (mandarin)",
  es: "spanish",
  fr: "french",
  de: "german",
  ar: "arabic",
  pt: "portuguese",
  ru: "russian",
  ja: "japanese",
  hi: "hindi",
  it: "italian",
  nl: "dutch",
  pl: "polish",
  tr: "turkish",
  hy: "armenian",
  fa: "persian",
  vi: "vietnamese",
  id: "indonesian",
  ko: "korean",
  bn: "bengali",
  ur: "urdu",
  th: "thai",
  sv: "swedish",
  da: "danish",
  fi: "finnish",
  hu: "hungarian",
}


const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  "chinese (mandarin)": "zh",
  spanish: "es",
  french: "fr",
  german: "de",
  arabic: "ar",
  portuguese: "pt",
  russian: "ru",
  japanese: "ja",
  hindi: "hi",
  italian: "it",
  dutch: "nl",
  polish: "pl",
  turkish: "tr",
  armenian: "hy",
  persian: "fa",
  vietnamese: "vi",
  indonesian: "id",
  korean: "ko",
  bengali: "bn",
  urdu: "ur",
  thai: "th",
  swedish: "sv",
  danish: "da",
  finnish: "fi",
  hungarian: "hu",
}


interface TranslatorWidgetProps {
  selectedText?: string
}

export default function TranslatorWidget(props?: TranslatorWidgetProps) {
  const [input, setInput] = useState("")
  const [sourceLang, setSourceLang] = useState("italian")
  const [targetLang, setTargetLang] = useState("english")
  const [translated, setTranslated] = useState("")
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize from props
  useEffect(() => {
    if (props?.selectedText) {
      setInput(props.selectedText)
    }
  }, [props?.selectedText])

  // Load preferences + legacy events
  useEffect(() => {
    if (window.electronAPI?.getPreferences) {
      window.electronAPI
        .getPreferences()
        .then((prefs: any) => {
          const defaultTarget = prefs?.translatorDefaultTarget || "it"
          setTargetLang(LANGUAGE_NAMES[defaultTarget] || "english")
        })
        .catch((err: any) => console.error("Error getting preferences:", err))
    }

    if (window.electronAPI?.onTranslatorInit) {
      window.electronAPI.onTranslatorInit((_e: any, data: any) => {
        if (data?.selectedText) setInput(data.selectedText)
      })
    }
  }, [])

  // Auto-translate effect
  useEffect(() => {
    const id = setTimeout(() => {
      if (!input.trim()) return setTranslated("")
      translateText(input, LANGUAGE_CODES[targetLang] || "en")
    }, 500)
    return () => clearTimeout(id)
  }, [input, targetLang])

  // Auto-size window height to hug content
  useEffect(() => {
    if (!containerRef.current) return

    const resizeWindow = () => {
      if (containerRef.current && window.electronAPI?.resizeWindow) {
        // scrollHeight already includes padding, so use it directly
        const height = containerRef.current.scrollHeight
        const newHeight = Math.max(height, 300) // Minimum 300px
        console.log('Translator: Resizing window', {
          scrollHeight: height,
          newHeight,
          hasInput: !!input,
          hasTranslation: !!translated
        })
        window.electronAPI.resizeWindow(newHeight)
      }
    }

    // Initial resize with delay to ensure content is rendered
    const timeoutId = setTimeout(resizeWindow, 150)

    // Use ResizeObserver to watch for content changes
    const resizeObserver = new ResizeObserver(() => {
      console.log('Translator: ResizeObserver triggered')
      resizeWindow()
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [input, translated, loading, sourceLang, targetLang])

  async function translateText(text: string, tgt: string) {
    setLoading(true)
    try {
      const res = await window.electronAPI.executeAction(`translate-${tgt}`, text)
      console.log('[TranslatorWidget] Translation response:', res)
      console.log('[TranslatorWidget] res.success:', res.success)
      console.log('[TranslatorWidget] res.result:', res.result)

      if (res.success) {
        console.log('[TranslatorWidget] Translated text:', res.result.translatedText)
        console.log('[TranslatorWidget] Detected language:', res.result.detectedSourceLanguage)

        setTranslated(res.result.translatedText || "")

        if (res.result.detectedSourceLanguage) {
          const detected = LANGUAGE_NAMES[res.result.detectedSourceLanguage]
          console.log('[TranslatorWidget] Detected language name:', detected)
          if (detected) setSourceLang(detected)
        }
      } else {
        setTranslated(`Error: ${res.error}`)
      }
    } catch (err) {
      console.error('[TranslatorWidget] Error:', err)
      setTranslated(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card ref={containerRef} className="w-full border border-ink-400 bg-ink-100 p-4 space-y-6 rounded-2xl">
      {/* Header */}
      <h2 className="h2 italic">translator</h2>
      <Separator />

      {/* SOURCE BLOCK */}
      <div className="rounded-xl border border-ink-400 p-4 space-y-3">
        <Combobox
          value={sourceLang}
          onChange={setSourceLang}
          items={Object.values(LANGUAGE_NAMES)}
          placeholder="Detecting..."
          searchPlaceholder="Search languages..."
          className="w-[160px]"
        />

        <Separator />

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to translate..."
          className="bg-transparent border-none resize-none p-0 text-sm"
        />
      </div>

      {/* TARGET BLOCK */}
      <div className="rounded-xl border border-ink-400 bg-ink-200 p-4 space-y-3">
        <Combobox
          value={targetLang}
          onChange={setTargetLang}
          items={Object.values(LANGUAGE_NAMES)}
          placeholder="Select language"
          searchPlaceholder="Search languages..."
          className="w-[160px]"
        />

        <Separator />

        <div className="text-sm text-ink-1000 min-h-[60px] leading-relaxed">
          {loading ? (
            <span className="text-ink-700">Translating...</span>
          ) : translated ? (
            translated
          ) : (
            <span className="text-ink-700">Translation will appear here...</span>
          )}
        </div>
      </div>

      <Separator />

      {/* Footer */}
      <div className="text-right text-ink-700 italic font-serif text-xl">
        by nullab
      </div>
    </Card>
  )
}
