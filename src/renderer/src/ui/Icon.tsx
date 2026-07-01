// Litet inline-SVG-ikonset. Monokromt (ärver färg via currentColor) så det
// följer temat, till skillnad från färgemoji. 16×16-ruta, stroke 1.3.

export type IconName =
  | 'file'
  | 'folder'
  | 'folderOpen'
  | 'lock'
  | 'repo'
  | 'sparkle'
  | 'clock'
  | 'palette'
  | 'package'

const PATHS: Record<IconName, JSX.Element> = {
  file: (
    <>
      <path d="M4 1.6h4.6L12 5v9a.4.4 0 0 1-.4.4H4a.4.4 0 0 1-.4-.4V2a.4.4 0 0 1 .4-.4Z" />
      <path d="M8.4 1.8V5h3.4" />
    </>
  ),
  folder: (
    <path d="M1.7 4.4a.9.9 0 0 1 .9-.9h3.1l1.2 1.4h5.8a.9.9 0 0 1 .9.9v6.4a.9.9 0 0 1-.9.9H2.6a.9.9 0 0 1-.9-.9Z" />
  ),
  folderOpen: (
    <>
      <path d="M1.7 4.4a.9.9 0 0 1 .9-.9h3.1l1.2 1.4h5.8a.9.9 0 0 1 .9.9v1.1H1.7Z" />
      <path d="M1.7 6.9h12.1l-1.3 5.2a.9.9 0 0 1-.87.7H2.9a.9.9 0 0 1-.87-.7Z" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.6" rx="1" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  repo: (
    <>
      <path d="M4 2.2h7.4a.6.6 0 0 1 .6.6v10.4a.6.6 0 0 1-.6.6H5a1 1 0 0 1-1-1Z" />
      <path d="M4 11.6h8" />
    </>
  ),
  sparkle: (
    <path
      d="M8 2.2l1.25 3.05L12.3 6.5 9.25 7.75 8 10.8 6.75 7.75 3.7 6.5l3.05-1.25Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 4.8V8.2l2.1 1.3" />
    </>
  ),
  palette: (
    <>
      <path d="M8 2.4a5.6 5.6 0 1 0 0 11.2c.9 0 1.3-.7 1.3-1.3 0-.7-.6-1-.6-1.6 0-.5.4-.9.9-.9h1.1a2.8 2.8 0 0 0 2.8-2.8C13.5 4.6 11 2.4 8 2.4Z" />
      <circle cx="5.8" cy="7" r=".7" fill="currentColor" stroke="none" />
      <circle cx="8" cy="5.4" r=".7" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="6.6" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  package: (
    <>
      <path d="M8 1.9 2.9 4.4v7.2L8 14.1l5.1-2.5V4.4Z" />
      <path d="M2.9 4.4 8 6.9l5.1-2.5M8 6.9v7.2" />
    </>
  )
}

export function Icon({
  name,
  size = 16,
  className
}: {
  name: IconName
  size?: number
  className?: string
}): JSX.Element {
  return (
    <svg
      className={`icon-svg${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
