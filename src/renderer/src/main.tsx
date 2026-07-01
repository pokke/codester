import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SettingsProvider } from './settings/SettingsContext'
import { ToastProvider } from './ui/Toast'
import { ConfirmProvider } from './ui/Confirm'
import { RepoProvider } from './state/RepoContext'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RepoProvider>
              <App />
            </RepoProvider>
          </ConfirmProvider>
        </ToastProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
