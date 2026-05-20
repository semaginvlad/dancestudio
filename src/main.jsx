import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  registerSW({
    immediate: false,
    onRegisterError(error) {
      console.error('Service worker registration failed', error)
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
