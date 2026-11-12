/**
 * Gemeinsamer Abgleich über Supabase.
 *
 * Prinzip: Die App arbeitet immer mit den lokalen Daten (funktioniert also auch offline).
 * Lokale Änderungen landen in einer Warteschlange ("Outbox") und werden hochgeladen,
 * sobald eine Verbindung besteht. Änderungen vom anderen Gerät kommen per Echtzeit-Kanal
 * (und als Rückfall per regelmäßigem Abruf) herein. Bei Konflikten gewinnt die letzte Änderung.
 */
import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { actions, onLocalChange } from './store'
import type { Baby, Entry, MedPreset } from './types'

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const syncConfigured = Boolean(SB_URL && SB_KEY)
const sb = syncConfigured ? createClient(SB_URL!, SB_KEY!) : null

const LS_FAMILY = 'baby-tracker.family'
const LS_OUTBOX = 'baby-tracker.outbox'
const LS_PULL = 'baby-tracker.lastPull'

export interface Family {
  id: string
  inviteCode: string
}

interface Outbox {
  ids: string[]
  profile: boolean
}

export interface SyncStatus {
  configured: boolean
  email?: string
  family?: Family
  phase: 'off' | 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  error?: string
  lastSync?: number
}

interface Row {
  id: string
  data: Partial<Entry>
  deleted: boolean
  updated_at: string
}

/* ---------- kleine Helfer für localStorage ---------- */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignorieren */
  }
}

/* ---------- Status (für die Oberfläche) ---------- */

let outbox: Outbox = read<Outbox>(LS_OUTBOX, { ids: [], profile: false })
let status: SyncStatus = {
  configured: syncConfigured,
  family: read<Family | undefined>(LS_FAMILY, undefined),
  phase: 'off',
  pending: outbox.ids.length + (outbox.profile ? 1 : 0),
}
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch, pending: outbox.ids.length + (outbox.profile ? 1 : 0) }
  listeners.forEach((l) => l())
}

export function useSync(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

function saveOutbox() {
  write(LS_OUTBOX, outbox)
  setStatus({})
}

function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort ist falsch.'
  if (/email not confirmed/i.test(msg)) return 'Bitte zuerst den Link in der Bestätigungs-E-Mail anklicken.'
  if (/already registered/i.test(msg)) return 'Für diese E-Mail gibt es schon ein Konto – bitte anmelden.'
  if (/password should be at least/i.test(msg)) return 'Das Passwort muss mindestens 6 Zeichen haben.'
  if (/invalid invite code/i.test(msg)) return 'Dieser Einladungscode ist ungültig.'
  if (/failed to fetch|network/i.test(msg)) return 'Keine Verbindung zum Server.'
  return msg
}

/* ---------- Hochladen ---------- */

let flushTimer: ReturnType<typeof setTimeout> | undefined
let flushing = false

function scheduleFlush(delay = 400) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flush(), delay)
}

async function flush() {
  const fam = status.family
  if (!sb || !fam || !status.email || flushing) return
  if (!navigator.onLine) return setStatus({ phase: 'offline' })
  if (!outbox.ids.length && !outbox.profile) return
  flushing = true
  setStatus({ phase: 'syncing' })
  try {
    const local = actions.get()
    const byId = new Map(local.entries.map((e) => [e.id, e]))
    const ids = [...outbox.ids]
    const sent = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 500) {
      const rows = ids.slice(i, i + 500).map((id) => {
        const e = byId.get(id)
        const data = e ?? {}
        sent.set(id, JSON.stringify(data))
        return { id, family_id: fam.id, data, deleted: !e }
      })
      const { error } = await sb.from('entries').upsert(rows)
      if (error) throw error
    }
    let profileSent = false
    if (outbox.profile) {
      const { error } = await sb.from('families').update({ baby: local.baby, meds: local.meds }).eq('id', fam.id)
      if (error) throw error
      profileSent = true
    }
    // Nur entfernen, was sich während des Uploads nicht erneut geändert hat
    const now = actions.get()
    const nowById = new Map(now.entries.map((e) => [e.id, e]))
    outbox = {
      ids: outbox.ids.filter((id) => sent.get(id) !== JSON.stringify(nowById.get(id) ?? {})),
      profile:
        outbox.profile &&
        !(profileSent && JSON.stringify([now.baby, now.meds]) === JSON.stringify([local.baby, local.meds])),
    }
    saveOutbox()
    setStatus({ phase: 'idle', error: undefined, lastSync: Date.now() })
  } catch (e) {
    setStatus({ phase: navigator.onLine ? 'error' : 'offline', error: errorText(e) })
  } finally {
    flushing = false
    if (outbox.ids.length || outbox.profile) scheduleFlush(5000)
  }
}

/* ---------- Herunterladen ---------- */

function applyRows(rows: Row[]) {
  if (!rows.length) return
  const pending = new Set(outbox.ids)
  actions.applyRemote((s) => {
    const map = new Map(s.entries.map((e) => [e.id, e]))
    for (const r of rows) {
      if (pending.has(r.id)) continue // lokale, noch nicht hochgeladene Änderung hat Vorrang
      if (r.deleted) map.delete(r.id)
      else map.set(r.id, { ...(r.data as Entry), id: r.id })
    }
    return { ...s, entries: [...map.values()] }
  })
  const newest = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), read<string>(LS_PULL, ''))
  write(LS_PULL, newest)
}

function applyProfile(row: { baby?: Baby; meds?: MedPreset[] }) {
  if (outbox.profile) return
  actions.applyRemote((s) => ({
    ...s,
    baby: { name: '', birth: '', ...(row.baby ?? {}) },
    meds: Array.isArray(row.meds) ? row.meds : s.meds,
  }))
}

let pulling = false
async function pull() {
  const fam = status.family
  if (!sb || !fam || !status.email || pulling) return
  if (!navigator.onLine) return setStatus({ phase: 'offline' })
  pulling = true
  try {
    // kleiner Überlapp, damit nichts durch gleichzeitige Schreibvorgänge verloren geht
    const last = read<string>(LS_PULL, '')
    const since = last ? new Date(new Date(last).getTime() - 10_000).toISOString() : ''
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      let q = sb
        .from('entries')
        .select('id,data,deleted,updated_at')
        .eq('family_id', fam.id)
        .order('updated_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (since) q = q.gte('updated_at', since)
      const { data, error } = await q
      if (error) throw error
      applyRows((data ?? []) as Row[])
      if (!data || data.length < PAGE) break
    }
    const { data: famRow, error } = await sb.from('families').select('baby,meds,invite_code').eq('id', fam.id).single()
    if (error) throw error
    applyProfile(famRow)
    setStatus({ phase: 'idle', error: undefined, lastSync: Date.now() })
  } catch (e) {
    setStatus({ phase: navigator.onLine ? 'error' : 'offline', error: errorText(e) })
  } finally {
    pulling = false
  }
}

/* ---------- Echtzeit ---------- */

let channel: RealtimeChannel | undefined

function subscribe() {
  unsubscribe()
  const fam = status.family
  if (!sb || !fam || !status.email) return
  channel = sb
    .channel(`family-${fam.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `family_id=eq.${fam.id}` }, (p) => {
      if (p.new && 'id' in p.new) applyRows([p.new as Row])
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'families', filter: `id=eq.${fam.id}` }, (p) => {
      applyProfile(p.new as { baby?: Baby; meds?: MedPreset[] })
    })
    .subscribe((s) => {
      if (s === 'SUBSCRIBED') void syncNow()
    })
}

function unsubscribe() {
  if (channel && sb) void sb.removeChannel(channel)
  channel = undefined
}

/* ---------- Öffentliche Funktionen ---------- */

export async function syncNow() {
  await flush()
  await pull()
}

function setFamily(f: Family | undefined) {
  write(LS_FAMILY, f)
  setStatus({ family: f })
}

async function findFamily(userId: string) {
  if (!sb) return
  const { data, error } = await sb
    .from('family_members')
    .select('family_id, families(id, invite_code)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
  if (error) throw error
  const f = (data?.[0] as unknown as { families?: { id: string; invite_code: string } } | undefined)?.families
  return f ? { id: f.id, inviteCode: f.invite_code } : undefined
}

async function onSession(session: Session | null) {
  if (!session) {
    unsubscribe()
    setStatus({ email: undefined, phase: 'off' })
    return
  }
  setStatus({ email: session.user.email ?? '' , phase: 'idle' })
  try {
    if (!status.family) {
      const f = await findFamily(session.user.id)
      if (f) {
        // Bestehende Familie auf neuem Gerät: Familien-Daten übernehmen
        replaceLocalWithFamily()
        setFamily(f)
      }
    }
    subscribe()
  } catch (e) {
    setStatus({ phase: 'error', error: errorText(e) })
  }
}

function replaceLocalWithFamily() {
  outbox = { ids: [], profile: false }
  saveOutbox()
  write(LS_PULL, undefined)
  actions.applyRemote(() => ({ version: 1, baby: { name: '', birth: '' }, entries: [], meds: [] }))
}

export async function signIn(email: string, password: string) {
  if (!sb) return 'Sync ist nicht eingerichtet.'
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  return error ? errorText(error) : undefined
}

/** Liefert eine Fehlermeldung oder 'confirm', wenn eine Bestätigungs-E-Mail verschickt wurde. */
export async function signUp(email: string, password: string) {
  if (!sb) return 'Sync ist nicht eingerichtet.'
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  })
  if (error) return errorText(error)
  return data.session ? undefined : 'confirm'
}

export async function signOut() {
  if (!sb) return
  await flush()
  unsubscribe()
  await sb.auth.signOut()
  setFamily(undefined)
  outbox = { ids: [], profile: false }
  saveOutbox()
  write(LS_PULL, undefined)
}

/** Neue Familie anlegen – die Daten dieses Geräts werden hochgeladen. */
export async function createFamily() {
  if (!sb) return 'Sync ist nicht eingerichtet.'
  const { data, error } = await sb.rpc('create_family')
  if (error) return errorText(error)
  const s = actions.get()
  outbox = { ids: s.entries.map((e) => e.id), profile: true }
  saveOutbox()
  write(LS_PULL, undefined)
  setFamily({ id: data.id, inviteCode: data.invite_code })
  subscribe()
  await syncNow()
}

/** Mit Code beitreten – die Daten dieses Geräts werden durch die der Familie ersetzt. */
export async function joinFamily(code: string) {
  if (!sb) return 'Sync ist nicht eingerichtet.'
  const { data, error } = await sb.rpc('join_family', { code })
  if (error) return errorText(error)
  replaceLocalWithFamily()
  setFamily({ id: data.id, inviteCode: data.invite_code })
  subscribe()
  await syncNow()
}

let started = false
export function initSync() {
  if (!sb || started) return
  started = true

  onLocalChange((c) => {
    if (!status.family) return
    outbox = {
      ids: [...new Set([...outbox.ids, ...c.entryIds])],
      profile: outbox.profile || c.profile,
    }
    saveOutbox()
    scheduleFlush()
  })

  let lastUser: string | undefined | null = null
  sb.auth.onAuthStateChange((event, session) => {
    if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return
    const user = session?.user.id
    if (user === lastUser) return // z. B. erneutes SIGNED_IN beim Zurückkehren zum Tab
    lastUser = user
    // außerhalb des Auth-Callbacks ausführen (Supabase empfiehlt keine await-Aufrufe darin)
    setTimeout(() => void onSession(session), 0)
  })

  window.addEventListener('online', () => {
    setStatus({ phase: 'idle' })
    subscribe()
  })
  window.addEventListener('offline', () => setStatus({ phase: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  // Rückfall, falls der Echtzeit-Kanal hängt
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)
}
