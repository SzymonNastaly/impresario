import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Follow the OS light/dark setting. Electron mirrors the system theme into the
// renderer's prefers-color-scheme, so toggling `.dark` keeps the app in sync —
// including live changes while the app is open.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (dark: boolean): void => {
  document.documentElement.classList.toggle('dark', dark)
}
applyTheme(darkQuery.matches)
darkQuery.addEventListener('change', (e) => applyTheme(e.matches))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
