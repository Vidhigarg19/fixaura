import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import LanguageToggle from '../src/components/LanguageToggle'
import { getLocale, t } from '../src/i18n'

// Regression: the toggle crashed with "ReferenceError: toggle is not defined" because the handler
// was renamed while onClick still pointed at the old name. This renders the REAL component and
// switches the REAL locale store.

const button = () => screen.getByRole('button')

describe('LanguageToggle', () => {
  it('renders without an error and offers the other language', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LanguageToggle />)
    expect(button().getAttribute('aria-label')).toBe(t('common.toggleLanguageAria', 'en'))
    // In English the button offers Hindi.
    expect(button().textContent).toBe(t('common.languageHI', 'en'))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('switches EN to HI and back, changing the real locale', () => {
    render(<LanguageToggle />)
    expect(getLocale()).toBe('en')

    fireEvent.click(button())
    expect(getLocale()).toBe('hi')
    expect(button().textContent).toBe(t('common.languageEN', 'hi'))
    expect(button().getAttribute('aria-label')).toBe(t('common.toggleLanguageAria', 'hi'))
    expect(t('common.error')).toBe(t('common.error', 'hi'))

    fireEvent.click(button())
    expect(getLocale()).toBe('en')
    expect(button().textContent).toBe(t('common.languageHI', 'en'))
  })

  it('persists the choice and updates the document language', () => {
    render(<LanguageToggle />)
    fireEvent.click(button())
    expect(localStorage.getItem('fixaura-locale')).toBe('hi')
    expect(document.documentElement.lang).toBe('hi')

    fireEvent.click(button())
    expect(localStorage.getItem('fixaura-locale')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('calls onChange once per switch', () => {
    const onChange = vi.fn()
    render(<LanguageToggle onChange={onChange} />)
    fireEvent.click(button())
    fireEvent.click(button())
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('keeps the accessibility and styling hooks: touch size, focus ring, extra classes, language of the label', () => {
    render(<LanguageToggle className="rounded-full px-4" />)
    const classes = button().className
    expect(classes).toContain('min-h-11')
    expect(classes).toContain('min-w-11')
    expect(classes).toContain('focus-visible:outline-primary')
    expect(classes).toContain('px-4')
    // The visible label is in the other language, so it is marked with that language.
    expect(button().querySelector('span')?.getAttribute('lang')).toBe('hi')
    fireEvent.click(button())
    expect(button().querySelector('span')?.getAttribute('lang')).toBe('en')
  })

  it('stays in sync when the language is changed elsewhere', async () => {
    const { setLocale } = await import('../src/i18n')
    render(<LanguageToggle />)
    act(() => setLocale('hi'))
    expect(button().textContent).toBe(t('common.languageEN', 'hi'))
  })
})
