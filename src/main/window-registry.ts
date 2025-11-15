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
      width: 270,
      height: 320,
      transparent: false,
      backgroundColor: 'white',
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      blurDelay: 0, // Hide immediately on blur
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
      blurDelay: 0, // Hide immediately on blur
    },
  },
  // Action popover
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
      blurDelay: 200, // Small delay to prevent immediate hiding when clicking between windows
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

