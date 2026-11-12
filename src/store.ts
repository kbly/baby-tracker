import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppState, Entry, MedPreset } from './types'

const KEY = 'baby-tracker.v1'

const empty = (): AppState => ({
  version: 1,
  baby: { name: '', birth: '' },
  entries: [],
  meds: [],
})

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as AppState
    return { ...empty(), ...parsed }
  } catch {
    return empty()
  }
}

let state: AppState = load()
const listeners = new Set<() => void>()

/** Beobachter für lokale Änderungen (wird vom Sync genutzt). */
export interface ChangeInfo {
  entryIds: string[]
  profile: boolean
}
const changeListeners = new Set<(c: ChangeInfo) => void>()
export function onLocalChange(fn: (c: ChangeInfo) => void) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

function emit() {
  listeners.forEach((l) => l())
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* Speicher voll oder blockiert – Daten bleiben bis zum Neuladen im Speicher */
  }
}

function commit(next: AppState, change?: ChangeInfo) {
  state = next
  persist()
  emit()
  if (change && (change.entryIds.length || change.profile)) {
    changeListeners.forEach((l) => l(change))
  }
}

// Synchronisierung zwischen mehreren offenen Tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load()
      emit()
    }
  })
}

export function useStore(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

export const actions = {
  addEntry(e: Omit<Entry, 'id'>): Entry {
    const entry = { ...e, id: uid() }
    commit({ ...state, entries: [...state.entries, entry] }, { entryIds: [entry.id], profile: false })
    return entry
  },
  updateEntry(id: string, patch: Partial<Entry>) {
    commit(
      { ...state, entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
      { entryIds: [id], profile: false },
    )
  },
  deleteEntry(id: string) {
    commit({ ...state, entries: state.entries.filter((e) => e.id !== id) }, { entryIds: [id], profile: false })
  },
  setBaby(baby: AppState['baby']) {
    commit({ ...state, baby }, { entryIds: [], profile: true })
  },
  saveMed(med: MedPreset) {
    const others = state.meds.filter((m) => m.name.toLowerCase() !== med.name.toLowerCase())
    commit({ ...state, meds: [...others, med] }, { entryIds: [], profile: true })
  },
  deleteMed(name: string) {
    commit({ ...state, meds: state.meds.filter((m) => m.name !== name) }, { entryIds: [], profile: true })
  },
  /** Ersetzt alle Daten (Import, Beispieldaten). Wird mit dem Sync abgeglichen. */
  replaceAll(next: AppState) {
    const ids = new Set([...state.entries.map((e) => e.id), ...next.entries.map((e) => e.id)])
    commit({ ...empty(), ...next }, { entryIds: [...ids], profile: true })
  },
  reset() {
    const ids = state.entries.map((e) => e.id)
    commit(empty(), { entryIds: ids, profile: true })
  },
  /** Daten vom Server übernehmen – löst keinen erneuten Upload aus. */
  applyRemote(fn: (s: AppState) => AppState) {
    commit(fn(state))
  },
  get: () => state,
}

/** Liefert die aktuelle Zeit und aktualisiert sich regelmäßig (für Timer). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
