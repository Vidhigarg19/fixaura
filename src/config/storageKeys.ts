// Browser storage keys. The VALUES are frozen: changing one silently drops users' saved
// language, current repair or draft. A rename needs a migration that reads the old key first.
// Two keys still carry the former product name on purpose.

/** localStorage: selected language, 'en' or 'hi'. */
export const LOCALE_STORAGE_KEY = 'fixaura-locale'

/** sessionStorage: cache of the current repair (RepairSession). The database is authoritative. */
export const SESSION_STORAGE_KEY = 'fixaura-session'

/** sessionStorage: capture-page description draft (never the photo). */
export const CAPTURE_DRAFT_STORAGE_KEY = 'homegenie-capture-draft'
