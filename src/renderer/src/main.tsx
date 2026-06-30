import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SettingsProvider } from './settings/SettingsContext'
import { ToastProvider } from './ui/Toast'
import { ConfirmProvider } from './ui/Confirm'
import { RepoProvider } from './state/RepoContext'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RepoProvider>
            <App />
          </RepoProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  </React.StrictMode>
)
