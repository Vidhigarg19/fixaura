import { render } from '@testing-library/react'
import App from '../../src/App'

/** Renders the real <App /> (real router, providers and routes) at a URL. */
export function renderAppAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

export function currentPath() {
  return `${window.location.pathname}${window.location.search}`
}
