import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Icon-font resilience: raw Material Symbols ligature words (e.g. "grid_view") must
// never flash on screen before the icon font arrives. Icons stay hidden only while
// probing, and are always revealed afterwards (fail-open) so the UI can never be
// left with invisible icons (Plerdy UX fix).
const ICON_FONT_SPEC = "16px 'Material Symbols Outlined'"
const iconRoot = document.documentElement
iconRoot.classList.add('icons-pending')

const revealIcons = () => {
  iconRoot.classList.remove('icons-pending')
  iconRoot.classList.remove('icon-font-missing')
}

const probeIconFont = (attempt: number) => {
  if (!document.fonts?.load || !document.fonts?.check) {
    revealIcons()
    return
  }
  document.fonts
    .load(ICON_FONT_SPEC) // force-request the font so the check is meaningful
    .then(() => {
      if (document.fonts.check(ICON_FONT_SPEC)) {
        revealIcons()
      } else if (attempt < 3) {
        // The Google Fonts stylesheet may not be parsed yet — retry shortly.
        window.setTimeout(() => probeIconFont(attempt + 1), 1500)
      } else {
        // Font unavailable: reveal anyway (fail-open) rather than hide the UI.
        console.warn('[icons] Material Symbols font unavailable — ligature text may render as words.')
        revealIcons()
      }
    })
    .catch(() => revealIcons()) // API failure → fail-open
}

probeIconFont(1)
// Hard fallback so icons can never stay hidden indefinitely.
window.setTimeout(revealIcons, 6000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
