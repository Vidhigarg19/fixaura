# V09 device and accessibility checklist

Run this against a local build (`npm run build` then `npm run preview`) and against the Vercel preview. Tick each box only after you have seen it work. Nothing here has been verified in a real browser yet.

## 1. Pages by viewport and language

For each page, check: no horizontal scroll, nothing cut off, text readable, buttons and links at least 44 x 44 px, safety notices fully visible, correct language everywhere on the page (no English left over in Hindi).

Pages: Landing, Login, Sign up, Dashboard, Capture, Diagnosis (normal), Diagnosis (blocked panel), Diagnosis (follow-up questions), Tools, Guide, Guide unavailable panel, Verify, Completion, Repair history, Diagnosis history, Nearby shops, Assistant panel, Navbar menu (mobile), Account menu (desktop), Safety dialog, Delete dialog.

| Page | 320 EN | 320 HI | 390 EN | 390 HI | 1280 EN | 1280 HI |
| --- | --- | --- | --- | --- | --- | --- |
| Landing | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Login | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Sign up | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Dashboard | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Capture | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Diagnosis (normal) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Diagnosis (blocked panel) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Diagnosis (follow-up questions) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Tools | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Guide | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Guide unavailable panel | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Verify | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Completion | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Repair history | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Diagnosis history | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Nearby shops | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Assistant panel | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Navbar mobile menu | [ ] | [ ] | [ ] | [ ] | n/a | n/a |
| Account menu | n/a | n/a | n/a | n/a | [ ] | [ ] |
| Safety dialog | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Delete dialog | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## 2. Language toggle

- [ ] Switching to Hindi changes the visible text on the current page without a reload.
- [ ] `document.documentElement.lang` is `hi` in Hindi and `en` in English (check in DevTools Elements).
- [ ] The Hindi font is Noto Sans Devanagari (DevTools > Computed > Rendered Fonts).
- [ ] Hindi text has line height of at least 1.6 and no letter-spacing; no clipped matras.
- [ ] The choice survives a reload.

## 3. Keyboard only, full journey

Use Tab, Shift+Tab, Enter, Space and Escape only. Landing > Login > Capture (upload a photo and describe) > Diagnosis > Tools > Guide > Verify > Completion > History > Nearby > Assistant > sign out.

- [ ] The first Tab stop on every page is "Skip to main content", and Enter moves focus into the page content.
- [ ] Every control is reachable and shows a visible focus ring.
- [ ] Mobile menu: opens with Enter, focus moves inside, Tab stays inside, Escape closes, focus returns to the menu button.
- [ ] Account menu (desktop): opens with Enter, Escape closes, focus returns to the account button.
- [ ] Assistant: opens, focus lands in the message box, Tab stays inside, Escape closes, focus returns to the assistant button.
- [ ] Safety dialog: focus lands on Cancel (or the only button), Tab stays inside, Escape cancels, focus returns to where it was. The page behind cannot be reached.
- [ ] Delete dialog: same as above.
- [ ] Nothing important appears only on hover.
- [ ] Every form field has a label; errors are announced and linked to the field.

## 4. Zoom and text size

- [ ] 200% browser zoom at 1280 px wide: no overlap, no content lost, no horizontal scroll, dialogs scroll inside.
- [ ] 200% zoom on the Hindi pages.
- [ ] Safety notices and blocked panels are fully readable at 200% and at 320 px.

## 5. Reduced motion

Turn on "Reduce motion" in the operating system.

- [ ] Page entrance, AR overlay pulse, step timeline pulse, assistant dots and microphone rings are still (loading spinners may still turn).
- [ ] Smooth scrolling is off.

## 6. Voice unavailable or blocked

- [ ] In a browser without speech recognition (for example Firefox), capture, guide and assistant show a short translated note, and every action can still be done with buttons and typing.
- [ ] With the microphone blocked, the translated "microphone permission was denied" message appears (EN and HI) and typing still works.
- [ ] A voice command is never the only way to move to the next step.
- [ ] Known limit: the guide voice commands are recognised in English only (`en-US`), because the command words are English. Hindi users use the buttons.

## 7. Screen readers

NVDA with Firefox or Chrome on Windows, and TalkBack on Android.

- [ ] Landmarks are announced: banner, navigation, main, contentinfo (Landing footer).
- [ ] Headings make sense in order (one h1 per page).
- [ ] Dialogs are announced with their title and message; background content is not read.
- [ ] Loading, saving and error messages are announced (status and alert regions).
- [ ] Risk and blocked states are described in words, not only by colour.
- [ ] The language toggle is announced and Hindi text is read with a Hindi voice.

## 8. Real phone via Vercel preview

- [ ] Open the preview URL on a real phone (Android and, if possible, iPhone).
- [ ] Rotate between portrait and landscape: nothing is cut off, fixed bottom bars sit above the home indicator.
- [ ] Camera permission prompt, deny, then allow: both paths show clear messages in EN and HI.
- [ ] Upload a photo from the gallery.
- [ ] Tap targets are comfortable with one thumb.
- [ ] Use the phone's large font size setting: layout still works.

## Known items to review

- The landing footer legal items (Privacy policy, Terms of service, Cookie policy, Safety disclosure) were links to `#`. They are now plain text until real pages exist.
- The brand tagline "Your home our intelligence" is English in Hindi on purpose; decide whether to translate it.
- The loading screen and the session-check page in `src/App.tsx` have no skip target and one English word ("HomeGenie"); that file was out of scope.
