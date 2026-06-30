import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  BranchInfo,
  CommitLogEntry,
  RepoInfo,
  RepoStatus,
  Result,
  StashEntry
} from '../../../shared/types'
import { useToast } from '../ui/Toast'

// Hjälpare som packar upp Result-kuvert och visar fel som toast.
function useUnwrap(): <T>(p: Promise<Result<T>>, errPrefix?: string) => Promise<T | undefined> {
  const { notify } = useToast()
  return useCallback(
    async <T,>(p: Promise<Result<T>>, errPrefix = 'Fel'): Promise<T | undefined> => {
      const res = await p
      if (res.ok) return res.data
      notify(`${errPrefix}: ${res.error}`, 'error')
      return undefined
    },
    [notify]
  )
}

interface RepoState {
  repo: RepoInfo | null
  status: RepoStatus | null
  branches: BranchInfo[]
  log: CommitLogEntry[]
  files: string[]
  stashes: StashEntry[]
  openTabs: string[]
  activePath: string | null
  activeLine: number | null
  /** ökar vid varje omladdning – editorn lyssnar för auto-omläsning */
  revision: number
  busy: boolean
}

interface RepoContextValue extends RepoState {
  openDialog: () => Promise<void>
  cloneAndOpen: (url: string) => Promise<void>
  refresh: () => Promise<void>
  selectPath: (path: string | null, line?: number) => void
  closeTab: (path: string) => void
  checkout: (name: string) => Promise<void>
  createBranch: (name: string) => Promise<void>
  stage: (file: string) => Promise<void>
  unstage: (file: string) => Promise<void>
  stageAll: () => Promise<void>
  discard: (file: string) => Promise<void>
  resolveSide: (file: string, side: 'ours' | 'theirs') => Promise<void>
  stashSave: (message?: string) => Promise<void>
  stashApply: (index: number, pop: boolean) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  commit: (message: string) => Promise<boolean>
  push: () => Promise<void>
  pull: () => Promise<void>
  fetch: () => Promise<void>
}

const Ctx = createContext<RepoContextValue | null>(null)

export function RepoProvider({ children }: { children: ReactNode }): JSX.Element {
  const unwrap = useUnwrap()
  const { notify } = useToast()
  const [state, setState] = useState<RepoState>({
    repo: null,
    status: null,
    branches: [],
    log: [],
    files: [],
    stashes: [],
    openTabs: [],
    activePath: null,
    activeLine: null,
    revision: 0,
    busy: false
  })

  const loadRepoData = useCallback(async () => {
    const [status, branches, log, files, stashes] = await Promise.all([
      unwrap(window.api.git.status(), 'Status'),
      unwrap(window.api.git.branches(), 'Branches'),
      unwrap(window.api.git.log(100), 'Historik'),
      unwrap(window.api.git.listFiles(), 'Filer'),
      unwrap(window.api.git.stashList(), 'Stash')
    ])
    setState((s) => ({
      ...s,
      status: status ?? s.status,
      branches: branches ?? s.branches,
      log: log ?? s.log,
      files: files ?? s.files,
      stashes: stashes ?? s.stashes,
      revision: s.revision + 1
    }))
  }, [unwrap])

  const refresh = useCallback(async () => {
    if (!state.repo) return
    await loadRepoData()
  }, [state.repo, loadRepoData])

  const setRepo = useCallback(
    async (repo: RepoInfo) => {
      setState((s) => ({ ...s, repo, activePath: null, openTabs: [] }))
      await loadRepoData()
      // Återställ tidigare öppna flikar för detta repo (om filerna finns kvar)
      try {
        const raw = localStorage.getItem(`codester.tabs.${repo.path}`)
        const saved = raw ? JSON.parse(raw) : null
        if (saved && Array.isArray(saved.openTabs)) {
          setState((s) => {
            const valid = saved.openTabs.filter((p: string) => s.files.includes(p))
            const active = valid.includes(saved.activePath) ? saved.activePath : (valid[0] ?? null)
            return { ...s, openTabs: valid, activePath: active }
          })
        }
      } catch {
        // ignorera trasig data
      }
    },
    [loadRepoData]
  )

  // Spara öppna flikar per repo
  useEffect(() => {
    if (!state.repo) return
    localStorage.setItem(
      `codester.tabs.${state.repo.path}`,
      JSON.stringify({ openTabs: state.openTabs, activePath: state.activePath })
    )
  }, [state.repo, state.openTabs, state.activePath])

  // Återöppna senaste repo om main fortfarande har ett aktivt
  useEffect(() => {
    ;(async () => {
      const current = await unwrap(window.api.repo.current())
      if (current) {
        const info = await unwrap(window.api.repo.open(current))
        if (info) await setRepo(info)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setState((s) => ({ ...s, busy: true }))
    try {
      await fn()
    } finally {
      setState((s) => ({ ...s, busy: false }))
    }
  }, [])

  const openDialog = useCallback(async () => {
    const info = await unwrap(window.api.repo.openDialog(), 'Kunde inte öppna repo')
    if (info) {
      await setRepo(info)
      notify(`Öppnade ${info.name}`, 'success')
    }
  }, [unwrap, setRepo, notify])

  const cloneAndOpen = useCallback(
    async (url: string) => {
      await withBusy(async () => {
        const path = await unwrap(window.api.repo.cloneDialog(url), 'Kloning misslyckades')
        if (path) {
          const info = await unwrap(window.api.repo.open(path))
          if (info) {
            await setRepo(info)
            notify(`Klonade ${info.name}`, 'success')
          }
        }
      })
    },
    [unwrap, withBusy, setRepo, notify]
  )

  const selectPath = useCallback((path: string | null, line?: number) => {
    setState((s) => ({
      ...s,
      activePath: path,
      activeLine: line ?? null,
      openTabs: path && !s.openTabs.includes(path) ? [...s.openTabs, path] : s.openTabs
    }))
  }, [])

  const closeTab = useCallback((path: string) => {
    setState((s) => {
      const idx = s.openTabs.indexOf(path)
      const openTabs = s.openTabs.filter((p) => p !== path)
      let activePath = s.activePath
      if (s.activePath === path) {
        // aktivera grannen (föregående, annars nästa)
        activePath = openTabs[idx - 1] ?? openTabs[idx] ?? openTabs[openTabs.length - 1] ?? null
      }
      return { ...s, openTabs, activePath, activeLine: null }
    })
  }, [])

  // Auto-uppdatera när filbevakaren signalerar ändringar i repot
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    const unsub = window.api.onRepoChanged(() => refreshRef.current())
    return unsub
  }, [])

  const checkout = useCallback(
    async (name: string) => {
      await withBusy(async () => {
        await unwrap(window.api.git.checkout(name), 'Byte av branch')
        await loadRepoData()
      })
    },
    [unwrap, withBusy, loadRepoData]
  )

  const createBranch = useCallback(
    async (name: string) => {
      await unwrap(window.api.git.createBranch(name), 'Skapa branch')
      await loadRepoData()
      notify(`Skapade branch ${name}`, 'success')
    },
    [unwrap, loadRepoData, notify]
  )

  const stage = useCallback(
    async (file: string) => {
      await unwrap(window.api.git.stage(file), 'Stage')
      await refresh()
    },
    [unwrap, refresh]
  )
  const unstage = useCallback(
    async (file: string) => {
      await unwrap(window.api.git.unstage(file), 'Unstage')
      await refresh()
    },
    [unwrap, refresh]
  )
  const stageAll = useCallback(async () => {
    await unwrap(window.api.git.stageAll(), 'Stage alla')
    await refresh()
  }, [unwrap, refresh])
  const discard = useCallback(
    async (file: string) => {
      await unwrap(window.api.git.discard(file), 'Kasta ändringar')
      await refresh()
    },
    [unwrap, refresh]
  )
  const resolveSide = useCallback(
    async (file: string, side: 'ours' | 'theirs') => {
      await unwrap(window.api.git.resolveSide(file, side), 'Lös konflikt')
      await refresh()
      notify(`Löste ${file} (${side === 'ours' ? 'våra' : 'deras'})`, 'success')
    },
    [unwrap, refresh, notify]
  )
  const stashSave = useCallback(
    async (message?: string) => {
      await unwrap(window.api.git.stashSave(message), 'Stash')
      await loadRepoData()
      notify('Ändringar stashade', 'success')
    },
    [unwrap, loadRepoData, notify]
  )
  const stashApply = useCallback(
    async (index: number, pop: boolean) => {
      await unwrap(window.api.git.stashApply(index, pop), 'Stash')
      await loadRepoData()
      notify(pop ? 'Stash poppad' : 'Stash applicerad', 'success')
    },
    [unwrap, loadRepoData, notify]
  )
  const stashDrop = useCallback(
    async (index: number) => {
      await unwrap(window.api.git.stashDrop(index), 'Stash')
      await loadRepoData()
    },
    [unwrap, loadRepoData]
  )

  const commit = useCallback(
    async (message: string): Promise<boolean> => {
      const hash = await unwrap(window.api.git.commit(message), 'Commit')
      if (hash) {
        await loadRepoData()
        notify(`Committade ${hash.slice(0, 7)}`, 'success')
        return true
      }
      return false
    },
    [unwrap, loadRepoData, notify]
  )

  const push = useCallback(async () => {
    await withBusy(async () => {
      const r = await unwrap(window.api.git.push(), 'Push')
      if (r !== undefined) notify('Pushade till remote', 'success')
      await loadRepoData()
    })
  }, [unwrap, withBusy, loadRepoData, notify])

  const pull = useCallback(async () => {
    await withBusy(async () => {
      const r = await unwrap(window.api.git.pull(), 'Pull')
      if (r !== undefined) notify('Hämtade från remote', 'success')
      await loadRepoData()
    })
  }, [unwrap, withBusy, loadRepoData, notify])

  const fetch = useCallback(async () => {
    await unwrap(window.api.git.fetch(), 'Fetch')
    await loadRepoData()
  }, [unwrap, loadRepoData])

  return (
    <Ctx.Provider
      value={{
        ...state,
        openDialog,
        cloneAndOpen,
        refresh,
        selectPath,
        closeTab,
        checkout,
        createBranch,
        stage,
        unstage,
        stageAll,
        discard,
        resolveSide,
        stashSave,
        stashApply,
        stashDrop,
        commit,
        push,
        pull,
        fetch
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useRepo(): RepoContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRepo måste användas inom RepoProvider')
  return ctx
}
