// Delade tillståndsvyer så alla listor visar laddning/tomt likadant.

export function Loading({ label = 'Hämtar…' }: { label?: string }): JSX.Element {
  return (
    <div className="state-row">
      <span className="spinner">⟳</span> {label}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="state-empty">{children}</div>
}
