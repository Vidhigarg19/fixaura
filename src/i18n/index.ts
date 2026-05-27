import en from './en.json'
import hi from './hi.json'

export type Locale = 'en' | 'hi'
type Messages = typeof en
const catalogs: Record<Locale, Messages> = { en, hi }

let currentLocale: Locale =
  (typeof localStorage !== 'undefined' &&
    (localStorage.getItem('fixaura-locale') as Locale)) ||
  'en'

const localeListeners = new Set<() => void>()

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

export function setLocale(locale: Locale) {
  currentLocale = locale
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('fixaura-locale', locale)
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