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
const MAX_TOASTS = 4

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const notify = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++idRef.current
      // Tak: behåll de senaste, släpp äldsta
      setToasts((t) => [...t, { id, kind, message }].slice(-MAX_TOASTS))
      // Fel visas längre (mer att läsa/agera på)
      const ttl = kind === 'error' ? 7000 : 4000
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ttl)
      )
    },
    [dismiss]
  )

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.kind}`}
            role="status"
            title="Klicka för att stänga"
            onClick={() => dismiss(t.id)}
          >
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
