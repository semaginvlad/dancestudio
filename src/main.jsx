import React from 'react'
import ReactDOM from 'react-dom/client'
import { initializePwaUpdate } from './pwaUpdate'
import App from './App'

initializePwaUpdate()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
