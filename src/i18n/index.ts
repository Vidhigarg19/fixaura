import { LOCALE_STORAGE_KEY } from '../config/storageKeys'
import en from './en.json'
import hi from './hi.json'

export type Locale = 'en' | 'hi'
type Messages = typeof en
const catalogs: Record<Locale, Messages> = { en, hi }

let currentLocale: Locale =
  (typeof localStorage !== 'undefined' &&
    (localStorage.getItem(LOCALE_STORAGE_KEY) as Locale)) ||
  'en'

const localeListeners = new Set<() => void>()

/** Keep <html lang> in sync so screen readers and :lang(hi) CSS follow the toggle. */
function applyDocumentLang(locale: Locale) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = locale
  }
}

applyDocumentLang(currentLocale)

function getByPath(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return path
    }
  }
  return typeof cur === 'string' ? cur : path
}

export function t(key: string, locale?: Locale): string {
  const loc = locale ?? currentLocale
  return getByPath(catalogs[loc] as unknown as Record<string, unknown>, key)
}

let reverseCatalog: Map<string, string> | null = null

function flattenCatalog(obj: unknown, prefix: string, out: Map<string, string>) {
  if (typeof obj === 'string') {
    if (obj && !out.has(obj)) out.set(obj, prefix)
    return
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      flattenCatalog(value, prefix ? `${prefix}.${key}` : key, out)
    }
  }
}

/**
 * Turns an Error into text that is safe to show on screen. Only messages that are
 * already translated copy (created with t() in either language) are shown, in the
 * current language. Anything else (raw backend or developer text) becomes the fallback.
 */
export function localizedErrorMessage(error: unknown, fallbackKey: string): string {
  if (error instanceof Error && error.message) {
    if (!reverseCatalog) {
      reverseCatalog = new Map()
      flattenCatalog(en, '', reverseCatalog)
      flattenCatalog(hi, '', reverseCatalog)
    }
    const key = reverseCatalog.get(error.message)
    if (key) return t(key)
  }
  return t(fallbackKey)
}

export function setLocale(locale: Locale) {
  currentLocale = locale
  applyDocumentLang(locale)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }
  localeListeners.forEach((l) => l())
}

export function getLocale(): Locale {
  return currentLocale
}

export function subscribeLocale(listener: () => void) {
  localeListeners.add(listener)
  return () => localeListeners.delete(listener)
}