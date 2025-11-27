// src/utils/validation.ts

/**
 * Validation utilities for user input
 * Prevents security vulnerabilities and data corruption
 */

export interface ValidationResult {
  valid: boolean
  error?: string
  sanitized?: string
}

/**
 * Validate and sanitize text input
 */
export function validateTextInput(
  text: string | undefined | null,
  options: {
    maxLength?: number
    minLength?: number
    allowEmpty?: boolean
    trim?: boolean
  } = {}
): ValidationResult {
  const {
    maxLength = 10000,
    minLength = 0,
    allowEmpty = true,
    trim = true
  } = options

  // Check if input is provided
  if (text === undefined || text === null) {
    if (allowEmpty) {
      return { valid: true, sanitized: '' }
    }
    return { valid: false, error: 'Input is required' }
  }

  // Ensure it's a string
  if (typeof text !== 'string') {
    return { valid: false, error: 'Input must be a string' }
  }

  // Trim if requested
  const sanitized = trim ? text.trim() : text

  // Check empty after trim
  if (!sanitized && !allowEmpty) {
    return { valid: false, error: 'Input cannot be empty' }
  }

  // Check length constraints
  if (sanitized.length > maxLength) {
    return {
      valid: false,
      error: `Input exceeds maximum length of ${maxLength} characters`
    }
  }

  if (sanitized.length < minLength) {
    return {
      valid: false,
      error: `Input must be at least ${minLength} characters`
    }
  }

  return { valid: true, sanitized }
}

/**
 * Validate numeric input
 */
export function validateNumericInput(
  value: string | number | undefined | null,
  options: {
    min?: number
    max?: number
    allowNegative?: boolean
    allowDecimal?: boolean
  } = {}
): ValidationResult {
  const {
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    allowNegative = true,
    allowDecimal = true
  } = options

  if (value === undefined || value === null) {
    return { valid: false, error: 'Numeric input is required' }
  }

  // Convert to number
  const num = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(num)) {
    return { valid: false, error: 'Input must be a valid number' }
  }

  if (!allowNegative && num < 0) {
    return { valid: false, error: 'Input must be non-negative' }
  }

  if (!allowDecimal && !Number.isInteger(num)) {
    return { valid: false, error: 'Input must be an integer' }
  }

  if (num < min) {
    return { valid: false, error: `Input must be at least ${min}` }
  }

  if (num > max) {
    return { valid: false, error: `Input must be at most ${max}` }
  }

  return { valid: true, sanitized: String(num) }
}

/**
 * Validate action ID format
 */
export function validateActionId(actionId: string | undefined | null): ValidationResult {
  if (!actionId || typeof actionId !== 'string') {
    return { valid: false, error: 'Action ID is required' }
  }

  // Action IDs should be alphanumeric with hyphens/underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(actionId)) {
    return { valid: false, error: 'Invalid action ID format' }
  }

  if (actionId.length > 100) {
    return { valid: false, error: 'Action ID is too long' }
  }

  return { valid: true, sanitized: actionId }
}

/**
 * Validate widget ID format
 */
export function validateWidgetId(widgetId: string | undefined | null): ValidationResult {
  if (!widgetId || typeof widgetId !== 'string') {
    return { valid: false, error: 'Widget ID is required' }
  }

  // Widget IDs should be alphanumeric with hyphens
  if (!/^[a-zA-Z0-9-]+$/.test(widgetId)) {
    return { valid: false, error: 'Invalid widget ID format' }
  }

  if (widgetId.length > 50) {
    return { valid: false, error: 'Widget ID is too long' }
  }

  return { valid: true, sanitized: widgetId }
}

/**
 * Validate currency code format (ISO 4217)
 */
export function validateCurrencyCode(code: string | undefined | null): ValidationResult {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Currency code is required' }
  }

  // Currency codes should be exactly 3 uppercase letters
  if (!/^[A-Z]{3}$/.test(code)) {
    return { valid: false, error: 'Currency code must be 3 uppercase letters (ISO 4217)' }
  }

  return { valid: true, sanitized: code.toUpperCase() }
}

/**
 * Validate language code format
 */
export function validateLanguageCode(code: string | undefined | null): ValidationResult {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Language code is required' }
  }

  // Language codes should be 2-5 lowercase letters/numbers with optional hyphens
  if (!/^[a-z0-9-]{2,5}$/.test(code.toLowerCase())) {
    return { valid: false, error: 'Invalid language code format' }
  }

  return { valid: true, sanitized: code.toLowerCase() }
}

