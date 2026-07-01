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
  /** alla repon i arbetsytan (multi-root) */
  repos: RepoInfo[]
  status: RepoStatus | null
  branches: BranchInfo[]
  log: CommitLogEntry[]
  files: string[]
  stashes: StashEntry[]
  openTabs: string[]
  /** flik i förhandsläge (singelklick) – ersätts av nästa förhandsvisning */
  previewPath: string | null
  activePath: string | null
  activeLine: number | null
  /** ökar vid varje omladdning – editorn lyssnar för auto-omläsning */
  revision: number
  busy: boolean
}

interface RepoContextValue extends RepoState {
  openDialog: () => Promise<void>
  cloneAndOpen: (url: string) => Promise<void>
  addFolder: () => Promise<void>
  switchRepo: (path: string) => Promise<void>
  closeFolder: (path: string) => Promise<void>
  refresh: () => Promise<void>
  selectPath: (path: string | null, line?: number) => void
  previewFile: (path: string) => void
  pinTab: (path: string) => void
  closeTab: (path: string) => void
  closeTabs: (paths: string[]) => void
  reorderTabs: (from: string, to: string) => void
  checkout: (name: string) => Promise<void>
  createBranch: (name: string) => Promise<void>
  stage: (file: string) => Promise<void>
  unstage: (file: string) => Promise<void>
  stageAll: () => Promise<void>
  discard: (file: string) => Promise<void>
  stageHunk: (file: string, index: number) => Promise<void>
  unstageHunk: (file: string, index: number) => Promise<void>
  discardHunk: (file: string, index: number) => Promise<void>
  resolveSide: (file: string, side: 'ours' | 'theirs') => Promise<void>
  stashSave: (message?: string) => Promise<void>
  stashApply: (index: number, pop: boolean) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  commit: (message: string, amend?: boolean) => Promise<boolean>
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
    repos: [],
    status: null,
    branches: [],
    log: [],
    files: [],
    stashes: [],
    openTabs: [],
    previewPath: null,
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

  const refreshRepos = useCallback(async () => {
    const list = await unwrap(window.api.repo.list())
    if (list) setState((s) => ({ ...s, repos: list }))
  }, [unwrap])

  const setRepo = useCallback(
    async (repo: RepoInfo) => {
      localStorage.setItem('codester.lastRepo', repo.path)
      // Läs sparade flikar FÖRE nollställningen – annars hinner spara-effekten
      // skriva över dem med tomt innan vi återställer.
      let saved: { openTabs?: unknown; activePath?: unknown } | null = null
      try {
        const raw = localStorage.getItem(`codester.tabs.${repo.path}`)
        saved = raw ? JSON.parse(raw) : null
      } catch {
        saved = null
      }
      setState((s) => ({ ...s, repo, activePath: null, openTabs: [], previewPath: null }))
      await loadRepoData()
      await refreshRepos()
      // Återställ tidigare öppna flikar för detta repo (om filerna finns kvar)
      if (saved && Array.isArray(saved.openTabs)) {
        const savedTabs = saved.openTabs as string[]
        const savedActive = saved.activePath as string | null
        setState((s) => {
          const valid = savedTabs.filter((p) => s.files.includes(p))
          const active = savedActive && valid.includes(savedActive) ? savedActive : (valid[0] ?? null)
          return { ...s, openTabs: valid, activePath: active }
        })
      }
    },
    [loadRepoData, refreshRepos]
  )

  // Spara öppna flikar per repo
  useEffect(() => {
    if (!state.repo) return
    localStorage.setItem(
      `codester.tabs.${state.repo.path}`,
      JSON.stringify({ openTabs: state.openTabs, activePath: state.activePath })
    )
  }, [state.repo, state.openTabs, state.activePath])

  // Återöppna hela arbetsytan vid start (överlever omstart/uppdatering).
  // Repon som inte längre finns glöms tyst.
  useEffect(() => {
    ;(async () => {
      let saved: string[] = []
      try {
        const raw = localStorage.getItem('codester.workspace')
        if (raw) saved = JSON.parse(raw)
      } catch {
        saved = []
      }
      const current = await unwrap(window.api.repo.current())
      const last = current ?? localStorage.getItem('codester.lastRepo')
      const paths = saved.length ? saved : last ? [last] : []
      if (!paths.length) return
      const opened: string[] = []
      for (const p of paths) {
        const res = await window.api.repo.add(p)
        if (res.ok) opened.push(p)
      }
      if (!opened.length) {
        localStorage.removeItem('codester.lastRepo')
        localStorage.removeItem('codester.workspace')
        return
      }
      const active = last && opened.includes(last) ? last : opened[0]
      const info = await unwrap(window.api.repo.setActive(active))
      if (info) await setRepo(info)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Spara arbetsytans repon
  useEffect(() => {
    localStorage.setItem('codester.workspace', JSON.stringify(state.repos.map((r) => r.path)))
  }, [state.repos])

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

  // Lägg till en mapp i arbetsytan (byter inte aktivt om ett redan finns)
  const addFolder = useCallback(async () => {
    const info = await unwrap(window.api.repo.addDialog(), 'Kunde inte lägga till mapp')
    if (!info) return
    await refreshRepos()
    notify(`La till ${info.name}`, 'success')
    if (!state.repo) await setRepo(info) // första repot → aktivera direkt
  }, [unwrap, refreshRepos, notify, state.repo, setRepo])

  // Byt aktivt repo (källkontroll/branch-vy följer med)
  const switchRepo = useCallback(
    async (path: string) => {
      if (path === state.repo?.path) return
      const info = await unwrap(window.api.repo.setActive(path))
      if (info) await setRepo(info)
    },
    [state.repo, unwrap, setRepo]
  )

  // Ta bort en mapp ur arbetsytan
  const closeFolder = useCallback(
    async (path: string) => {
      await window.api.repo.close(path)
      const list = (await unwrap(window.api.repo.list())) ?? []
      setState((s) => ({ ...s, repos: list }))
      if (state.repo?.path === path) {
        if (list[0]) {
          const info = await unwrap(window.api.repo.setActive(list[0].path))
          if (info) await setRepo(info)
        } else {
          localStorage.removeItem('codester.lastRepo')
          setState((s) => ({
            ...s,
            repo: null,
            status: null,
            branches: [],
            log: [],
            files: [],
            stashes: [],
            openTabs: [],
            previewPath: null,
            activePath: null
          }))
        }
      }
    },
    [state.repo, unwrap, setRepo]
  )

  // Öppna/fäst en flik permanent (dubbelklick, sökträff, quick open)
  const selectPath = useCallback((path: string | null, line?: number) => {
    setState((s) => ({
      ...s,
      activePath: path,
      activeLine: line ?? null,
      openTabs: path && !s.openTabs.includes(path) ? [...s.openTabs, path] : s.openTabs,
      previewPath: s.previewPath === path ? null : s.previewPath
    }))
  }, [])

  // Förhandsvisa (singelklick) – återanvänder förhandsfliken istället för ny
  const previewFile = useCallback((path: string) => {
    setState((s) => {
      if (s.openTabs.includes(path) && s.previewPath !== path) {
        // redan en fäst flik → bara aktivera
        return { ...s, activePath: path, activeLine: null }
      }
      const pinned = s.openTabs.filter((p) => p !== s.previewPath)
      return {
        ...s,
        openTabs: [...pinned, path],
        previewPath: path,
        activePath: path,
        activeLine: null
      }
    })
  }, [])

  const pinTab = useCallback((path: string) => {
    setState((s) => (s.previewPath === path ? { ...s, previewPath: null } : s))
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
      return {
        ...s,
        openTabs,
        activePath,
        activeLine: null,
        previewPath: s.previewPath === path ? null : s.previewPath
      }
    })
  }, [])

  const reorderTabs = useCallback((from: string, to: string) => {
    setState((s) => {
      const arr = [...s.openTabs]
      const fi = arr.indexOf(from)
      const ti = arr.indexOf(to)
      if (fi < 0 || ti < 0 || fi === ti) return s
      arr.splice(fi, 1)
      arr.splice(ti, 0, from)
      return { ...s, openTabs: arr }
    })
  }, [])

  const closeTabs = useCallback((paths: string[]) => {
    const drop = new Set(paths)
    setState((s) => {
      const openTabs = s.openTabs.filter((p) => !drop.has(p))
      const activePath =
        s.activePath && drop.has(s.activePath)
          ? (openTabs[openTabs.length - 1] ?? null)
          : s.activePath
      return {
        ...s,
        openTabs,
        activePath,
        activeLine: null,
        previewPath: s.previewPath && drop.has(s.previewPath) ? null : s.previewPath
      }
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
    async (message: string, amend = false): Promise<boolean> => {
      const hash = await unwrap(window.api.git.commit(message, amend), 'Commit')
      if (hash) {
        await loadRepoData()
        notify(amend ? 'Ändrade senaste commit' : `Committade ${hash.slice(0, 7)}`, 'success')
        return true
      }
      return false
    },
    [unwrap, loadRepoData, notify]
  )

  const stageHunk = useCallback(
    async (file: string, index: number) => {
      await unwrap(window.api.git.stageHunk(file, index), 'Stage hunk')
      await refresh()
    },
    [unwrap, refresh]
  )
  const unstageHunk = useCallback(
    async (file: string, index: number) => {
      await unwrap(window.api.git.unstageHunk(file, index), 'Unstage hunk')
      await refresh()
    },
    [unwrap, refresh]
  )
  const discardHunk = useCallback(
    async (file: string, index: number) => {
      await unwrap(window.api.git.discardHunk(file, index), 'Kasta hunk')
      await refresh()
    },
    [unwrap, refresh]
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
        addFolder,
        switchRepo,
        closeFolder,
        refresh,
        selectPath,
        previewFile,
        pinTab,
        closeTab,
        closeTabs,
        reorderTabs,
        checkout,
        createBranch,
        stage,
        unstage,
        stageAll,
        discard,
        stageHunk,
        unstageHunk,
        discardHunk,
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
