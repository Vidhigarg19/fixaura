import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setLocale } from '../src/i18n'

// Browser APIs that jsdom does not provide. They are inert stubs: no network, no media.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
if (!('IntersectionObserver' in window)) {
  Object.defineProperty(window, 'IntersectionObserver', { value: InertObserver, configurable: true })
}
if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', { value: InertObserver, configurable: true })
}
window.scrollTo = (() => {}) as typeof window.scrollTo
Element.prototype.scrollIntoView = () => {}

beforeEach(() => {
  // Any real network request in a test is a bug: fail loudly instead of connecting.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('Network access is blocked in tests')
  }) as unknown as typeof fetch
  sessionStorage.clear()
  localStorage.clear()
  setLocale('en')
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  cleanup()
})
