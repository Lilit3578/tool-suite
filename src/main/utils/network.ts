// src/main/utils/network.ts
import { createLogger } from './logger'

const logger = createLogger('Network')

export interface RetryOptions {
    maxRetries?: number
    retryDelay?: number
    timeout?: number
}

/**
 * Fetch with automatic retry logic for network failures
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: RetryOptions = {}
): Promise<Response> {
    const {
        maxRetries = 3,
        retryDelay = 1000,
        timeout = 10000
    } = retryOptions

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Add timeout to fetch
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeout)

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            // Success - return response
            if (response.ok) {
                return response
            }

            // Retry on 5xx server errors (but not 4xx client errors)
            if (response.status >= 500 && attempt < maxRetries) {
                logger.warn(`Server error ${response.status}, retrying (${attempt}/${maxRetries})`)
                await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
                continue
            }

            // Don't retry on 4xx errors - return the error response
            return response

        } catch (error: any) {
            // Network error or timeout
            if (attempt === maxRetries) {
                logger.error('Max retries exceeded:', error)
                throw error
            }

            logger.warn(`Network error, retrying (${attempt}/${maxRetries}):`, error.message)
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
        }
    }

    throw new Error('Max retries exceeded')
}

/**
 * Simple rate limiter to prevent API abuse
 */
export class RateLimiter {
    private queue: Array<() => Promise<any>> = []
    private processing = false
    private lastRequest = 0
    private minInterval: number

    constructor(requestsPerSecond: number = 10) {
        this.minInterval = 1000 / requestsPerSecond
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const now = Date.now()
                    const wait = Math.max(0, this.minInterval - (now - this.lastRequest))

                    if (wait > 0) {
                        await new Promise(r => setTimeout(r, wait))
                    }

                    this.lastRequest = Date.now()
                    const result = await fn()
                    resolve(result)
                } catch (error) {
                    reject(error)
                }
            })

            this.processQueue()
        })
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return
        }

        this.processing = true

        while (this.queue.length > 0) {
            const task = this.queue.shift()
            if (task) {
                await task()
            }
        }

        this.processing = false
    }
}

/**
 * Simple in-memory cache with TTL
 */
export class SimpleCache<T> {
    private cache = new Map<string, { value: T; timestamp: number }>()
    private maxAge: number

    constructor(maxAgeMs: number = 3600000) { // Default 1 hour
        this.maxAge = maxAgeMs
    }

    get(key: string): T | null {
        const cached = this.cache.get(key)
        if (!cached) return null

        if (Date.now() - cached.timestamp > this.maxAge) {
            this.cache.delete(key)
            return null
        }

        return cached.value
    }

    set(key: string, value: T): void {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        })
    }

    clear(): void {
        this.cache.clear()
    }

    size(): number {
        return this.cache.size
    }
}
