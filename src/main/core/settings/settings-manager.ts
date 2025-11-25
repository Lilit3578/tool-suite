// src/main/settings-manager.ts
import ElectronStore from 'electron-store'
import { createLogger } from '../../utils/logger'
const logger = createLogger('Settings')

type Schema = {
  preferences: Record<string, any>
  usage: Record<string, number>
}

const store = new ElectronStore<Schema>({
  defaults: { preferences: { translatorDefaultTarget: 'it' }, usage: {} }
}) as any

export const settingsManager = {
  init(defaults?: Record<string, any>) {
    if (defaults) {
      const prefs = store.get('preferences') || {}
      store.set('preferences', { ...defaults, ...prefs })
    }
  },
  get(key: string) {
    const prefs = store.get('preferences') || {}
    return prefs[key]
  },
  set(key: string, value: any) {
    const prefs = store.get('preferences') || {}
    store.set('preferences', { ...prefs, [key]: value })
  },
  getAll() {
    return store.get('preferences')
  },
  setAll(obj: Record<string, any>) {
    store.set('preferences', obj)
  },

  getUsage(key: string): number {
    const usage = store.get('usage') || {}
    return usage[key] ?? 0   // ✅ No Number() here
  },

  incrementUsage(key: string) {
    const usage = store.get('usage') || {}
    usage[key] = (usage[key] ?? 0) + 1
    store.set('usage', usage)
    logger.debug(`usage ${key} -> ${usage[key]}`)
  }


}

export type SettingsManager = typeof settingsManager
export default settingsManager
