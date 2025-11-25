// src/main/window-registry.ts
// Maps widget/action IDs to React component types and default window configs

export interface WindowTypeConfig {
  componentType: string;
  defaultConfig: {
    width: number;
    height: number;
    transparent: boolean;
    backgroundColor?: string;
    frame: boolean;
    alwaysOnTop: boolean;
    resizable: boolean;
    skipTaskbar: boolean;
    blurDelay: number;
  };
}

export const WINDOW_REGISTRY: Record<string, WindowTypeConfig> = {
  // Main command palette
  palette: {
    componentType: 'palette',
    defaultConfig: {
      width: 550,  // Changed from 270 to accommodate popover
      height: 320,
      transparent: true,  // Changed to true
      backgroundColor: '#00000000',  // Changed to fully transparent
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      blurDelay: 0,
    },
  },
  // Translator widget
  translator: {
    componentType: 'translator',
    defaultConfig: {
      width: 480,
      height: 540,
      transparent: false,
      backgroundColor: 'transparent',
      frame: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      blurDelay: 0,
    },
  },
  // Currency converter window config
  'currency-converter': {
    componentType: 'currency-converter',
    defaultConfig: {
      width: 450,
      height: 400,  // Reduced from 520 to hug content
      transparent: false,
      backgroundColor: '#f9fafb',
      frame: false,
      alwaysOnTop: true,
      resizable: false,  // Fixed size
      skipTaskbar: true,
      blurDelay: 200,
    },
  },
  // Clipboard history widget
  'clipboard-history': {
    componentType: 'clipboard-history',
    defaultConfig: {
      width: 270,  // Match command palette width
      height: 400,  // Fixed height - will auto-size to content
      transparent: false,
      backgroundColor: '#ffffff',
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      blurDelay: 0,  // Immediate hide on blur
    },
  },
  // Action popover - NO LONGER NEEDED as separate window
  // Keeping for backward compatibility, but won't be used
  'action-popover': {
    componentType: 'action-popover',
    defaultConfig: {
      width: 256,
      height: 100,
      transparent: false,
      backgroundColor: 'white',
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      blurDelay: 200,
    },
  },
}

// Get window config for a widget/action, merging widget-specific options with defaults
export function getWindowConfig(widgetId: string, widgetWindowOptions?: any): WindowTypeConfig['defaultConfig'] {
  const registryEntry = WINDOW_REGISTRY[widgetId]
  const defaultConfig = registryEntry?.defaultConfig || WINDOW_REGISTRY.palette.defaultConfig

  // Merge widget-specific windowOptions with defaults
  if (widgetWindowOptions) {
    return {
      ...defaultConfig,
      ...widgetWindowOptions,
      // Ensure required fields are set
      width: widgetWindowOptions.width ?? defaultConfig.width,
      height: widgetWindowOptions.height ?? defaultConfig.height,
    }
  }

  return defaultConfig
}

// Get component type for a widget/action
export function getComponentType(widgetId: string): string {
  const registryEntry = WINDOW_REGISTRY[widgetId]
  return registryEntry?.componentType || 'palette'
}
