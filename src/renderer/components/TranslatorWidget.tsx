// src/renderer/components/TranslatorWidget.tsx
import React, { useEffect, useState } from "react"
import { Card } from "./ui/card"
import { Separator } from "./ui/separator"
import { Textarea } from "./ui/textarea"
import { Combobox } from "./ui/combobox"

declare global {
  interface Window {
    electronAPI: any
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  it: "italian",
  en: "english",
  fr: "french",
  de: "german",
  es: "spanish",
}

const LANGUAGE_CODES: Record<string, string> = {
  italian: "it",
  english: "en",
  french: "fr",
  german: "de",
  spanish: "es",
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

  async function translateText(text: string, tgt: string) {
    setLoading(true)
    try {
      const res = await window.electronAPI.executeAction(`translate-${tgt}`, text)

      if (res.success) {
        setTranslated(res.result.translatedText || "")

        if (res.result.detectedSourceLanguage) {
          const detected = LANGUAGE_NAMES[res.result.detectedSourceLanguage]
          if (detected) setSourceLang(detected)
        }
      } else {
        setTranslated(`Error: ${res.error}`)
      }
    } catch (err) {
      setTranslated(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full border border-ink-400 bg-ink-100 p-4 space-y-6 rounded-2xl">
      {/* Header */}
      <h2 className="h2 italic">translator</h2>
      <Separator />

      {/* SOURCE BLOCK */}
      <div className="rounded-xl border border-ink-400 p-4 space-y-3">
        <Combobox
          value={sourceLang}
          onChange={setSourceLang}
          items={Object.values(LANGUAGE_NAMES)}
          placeholder="Select language"
          className="w-[160px]"
        />

        <Separator />

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to translate..."
          className="bg-transparent border-none shadow-none resize-none p-0 text-sm"
        />
      </div>

      {/* TARGET BLOCK */}
      <div className="rounded-xl border border-ink-400 bg-ink-200 p-4 space-y-3">
        <Combobox
          value={targetLang}
          onChange={setTargetLang}
          items={Object.values(LANGUAGE_NAMES)}
          placeholder="Select language"
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
