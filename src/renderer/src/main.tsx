import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SettingsProvider } from './settings/SettingsContext'
import { ToastProvider } from './ui/Toast'
import { RepoProvider } from './state/RepoContext'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <RepoProvider>
          <App />
        </RepoProvider>
      </ToastProvider>
    </SettingsProvider>
  </React.StrictMode>
)
