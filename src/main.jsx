import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initPWA } from './lib/pwa'
import { initViewport } from './lib/viewport'
import { unlockAudio } from './lib/sounds'

initPWA()
initViewport()
// browsers only allow sound after a tap: unlock it on the first one
window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
