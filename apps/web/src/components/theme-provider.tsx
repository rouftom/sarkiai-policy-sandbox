'use client'

import * as React from 'react'
import {
  MODE_STORAGE_KEY,
  THEME_PACKS,
  THEME_STORAGE_KEY,
  applyThemePack,
  readStoredTheme,
  type ThemeMode,
} from '@/lib/chrome-theme'

interface ThemeContextValue {
  packId: string
  mode: ThemeMode
  packs: typeof THEME_PACKS
  setPack: (id: string) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [packId, setPackId] = React.useState('governance')
  const [mode, setMode] = React.useState<ThemeMode>('light')

  React.useEffect(() => {
    const stored = readStoredTheme()
    setPackId(stored.packId)
    setMode(stored.mode)
    applyThemePack(stored.packId, stored.mode)
  }, [])

  const setPack = React.useCallback(
    (id: string) => {
      setPackId(id)
      localStorage.setItem(THEME_STORAGE_KEY, id)
      applyThemePack(id, mode)
    },
    [mode],
  )

  const setMode = React.useCallback(
    (next: ThemeMode) => {
      setMode(next)
      localStorage.setItem(MODE_STORAGE_KEY, next)
      applyThemePack(packId, next)
    },
    [packId],
  )

  const value = React.useMemo<ThemeContextValue>(
    () => ({ packId, mode, packs: THEME_PACKS, setPack, setMode, toggleMode: () => setMode(mode === 'dark' ? 'light' : 'dark') }),
    [packId, mode, setPack, setMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
