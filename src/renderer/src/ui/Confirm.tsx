import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react'

interface ConfirmOpts {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}
interface State extends ConfirmOpts {
  resolve: (v: boolean) => void
}

const Ctx = createContext<(opts: ConfirmOpts) => Promise<boolean>>(() =>
  Promise.resolve(false)
)

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<State | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    []
  )

  const close = useCallback(
    (v: boolean) => {
      setState((s) => {
        s?.resolve(v)
        return null
      })
    },
    []
  )

  // Escape avbryter alltid. Enter bekräftar bara för icke-destruktiva dialoger
  // (destruktiva kräver ett medvetet klick).
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && !state.danger) close(true)
      else if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div className="overlay" onClick={() => close(false)}>
          <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{state.title ?? 'Bekräfta'}</div>
            <div className="modal-body">
              <p>{state.message}</p>
              <div className="dialog-actions">
                <button
                  className="btn ghost"
                  autoFocus={state.danger}
                  onClick={() => close(false)}
                >
                  {state.cancelLabel ?? 'Avbryt'}
                </button>
                <button
                  className={`btn ${state.danger ? 'danger-btn' : 'primary'}`}
                  autoFocus={!state.danger}
                  onClick={() => close(true)}
                >
                  {state.confirmLabel ?? 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useConfirm(): (opts: ConfirmOpts) => Promise<boolean> {
  return useContext(Ctx)
}
