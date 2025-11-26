// src/main/types.ts
// WidgetAction represents an action that can be executed from a widget
export interface WidgetAction {
  id: string;
  label: string;
  /**
   * Keywords improve search accuracy. Add:
   * - Language/currency names and codes
   * - Common synonyms and abbreviations
   * - Related terms users might search for
   */
  keywords?: string[];
  tags?: string[];  // Categories (e.g., ["translation", "language"])
  handler?: (selectedText?: string) => Promise<any> | any;
}

export interface WindowConfig {
  width: number;
  height: number;
  transparent?: boolean;
  backgroundColor?: string;
  frame?: boolean;
  alwaysOnTop?: boolean;
  resizable?: boolean;
  skipTaskbar?: boolean;
  blurDelay?: number; // Delay in ms before hiding on blur
}

export interface Widget {
  id: string;
  label: string;
  icon?: string;
  keywords?: string[];  // Searchable terms for this widget
  tags?: string[];      // Categories
  actions?: WidgetAction[];
  windowOptions?: WindowConfig;
  componentType?: string; // React component name to render (e.g., 'translator', 'palette', 'inline-result')
  initialize?: () => Promise<void> | void;
  show?: (selectedText?: string) => Promise<any> | any;
}

export interface ClipboardItem {
  text?: string
  image?: any  // NativeImage serialization
  html?: string
  rtf?: string
  timestamp: number
  preview: string
}

export interface ClipboardPreview {
  id: string
  preview: string
  timestamp: number
}

export interface PaletteTriggerContext {
  selectedText?: string
  clipboardPreview?: ClipboardPreview[]
  sourceApp?: string
}

