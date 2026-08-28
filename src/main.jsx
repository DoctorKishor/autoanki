import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { checkAndResumePendingSync } from './services/googleDriveSync.js'

// FIX-17B: Resume any pending cloud synchronization flagged on previous session exit
checkAndResumePendingSync();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
