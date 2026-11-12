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

function emit() {
  listeners.forEach((l) => l())
}

function commit(next: AppState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* Speicher voll oder blockiert – Daten bleiben bis zum Neuladen im Speicher */
  }
  emit()
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
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export const actions = {
  addEntry(e: Omit<Entry, 'id'>): Entry {
    const entry = { ...e, id: uid() }
    commit({ ...state, entries: [...state.entries, entry] })
    return entry
  },
  updateEntry(id: string, patch: Partial<Entry>) {
    commit({
      ...state,
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  },
  deleteEntry(id: string) {
    commit({ ...state, entries: state.entries.filter((e) => e.id !== id) })
  },
  setBaby(baby: AppState['baby']) {
    commit({ ...state, baby })
  },
  saveMed(med: MedPreset) {
    const others = state.meds.filter((m) => m.name.toLowerCase() !== med.name.toLowerCase())
    commit({ ...state, meds: [...others, med] })
  },
  deleteMed(name: string) {
    commit({ ...state, meds: state.meds.filter((m) => m.name !== name) })
  },
  replaceAll(next: AppState) {
    commit({ ...empty(), ...next })
  },
  reset() {
    commit(empty())
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
