import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'info' | 'success' | 'error'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastCtx {
  notify: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast måste användas inom ToastProvider')
  return ctx
}
