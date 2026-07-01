import type { KeyboardEvent } from 'react'

// Gör en klickbar div tangentbords-aktiverbar (Enter/Mellanslag) och
// exponerar den som en knapp för skärmläsare. Sprids på element-props.
export function rowA11y(onActivate: () => void): {
  role: 'button'
  tabIndex: 0
  onKeyDown: (e: KeyboardEvent) => void
} {
  return {
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    }
  }
}
