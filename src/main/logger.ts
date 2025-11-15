// src/main/logger.ts
export function createLogger(scope = 'App') {
  return {
    info: (...args: any[]) => console.info(`[${scope}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${scope}]`, ...args),
    error: (...args: any[]) => console.error(`[${scope}]`, ...args),
    debug: (...args: any[]) => console.debug ? console.debug(`[${scope}]`, ...args) : console.log(`[${scope}]`, ...args),
  }
}
