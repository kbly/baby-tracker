/**
 * Lokale Erinnerungen (ohne Server): Die App prüft regelmäßig, ob ein Schlaffenster,
 * eine Mahlzeit oder eine Medikamentengabe ansteht, und zeigt dann eine Benachrichtigung.
 * Funktioniert, solange die App geöffnet ist oder kurz im Hintergrund läuft.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { actions } from './store'
import { forecastFeed, forecastSleep } from './predict'
import { fmtTime, HOUR, MIN } from './utils'

const LS = 'baby-tracker.notify'
const LS_FIRED = 'baby-tracker.notify.fired'

export interface NotifySettings {
  sleep: boolean
  feed: boolean
  med: boolean
  /** Minuten vorher erinnern */
  lead: number
}

const defaults: NotifySettings = { sleep: false, feed: false, med: false, lead: 10 }

function read<T>(k: string, f: T): T {
  try {
    const r = localStorage.getItem(k)
    return r ? { ...f, ...JSON.parse(r) } : f
  } catch {
    return f
  }
}

let settings: NotifySettings = read(LS, defaults)
const listeners = new Set<() => void>()

export function useNotifySettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => settings,
  )
}

export const notifySupported = typeof window !== 'undefined' && 'Notification' in window

export function permission(): NotificationPermission | 'unsupported' {
  return notifySupported ? Notification.permission : 'unsupported'
}

export async function updateNotifySettings(patch: Partial<NotifySettings>) {
  const turningOn = Object.entries(patch).some(([k, v]) => k !== 'lead' && v === true)
  if (turningOn && notifySupported && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission()
    if (p !== 'granted') return 'denied'
  }
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(LS, JSON.stringify(settings))
  } catch {
    /* ignorieren */
  }
  listeners.forEach((l) => l())
  return 'ok'
}

async function show(title: string, body: string, tag: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: './icon.svg', badge: './icon.svg' })
      return
    }
  } catch {
    /* Rückfall unten */
  }
  new Notification(title, { body, tag, icon: './icon.svg' })
}

export async function testNotification() {
  await show('Baby Tracker', 'So sehen die Erinnerungen aus. 👶', 'test')
}

interface Due {
  key: string
  at: number
  /** bis wann die Erinnerung noch sinnvoll ist */
  until: number
  title: string
  body: string
}

function upcoming(now: number): Due[] {
  const state = actions.get()
  const lead = settings.lead * MIN
  const out: Due[] = []
  const name = state.baby.name || 'Baby'
  if (settings.sleep) {
    const s = forecastSleep(state, now)
    if (s.state === 'awake' && s.next) {
      const bed = s.next.kind === 'bedtime'
      out.push({
        key: `sleep-${Math.round(s.since! / MIN)}`,
        at: s.next.from - lead,
        until: s.next.to,
        title: bed ? `🌙 Bald Schlafenszeit für ${name}` : `😴 Bald Zeit für ein Nickerchen`,
        body: `Schlaffenster ${fmtTime(s.next.from)} – ${fmtTime(s.next.to)}`,
      })
    }
  }
  if (settings.feed) {
    const f = forecastFeed(state, now)
    if (!f.feeding && f.next && f.last) {
      out.push({
        key: `feed-${f.last.id}`,
        at: f.next.from - lead,
        until: f.next.to,
        title: `🍼 ${name} hat bald Hunger`,
        body: `Nächste Mahlzeit ca. ${fmtTime(f.next.est)} (letzte um ${fmtTime(f.last.start)})`,
      })
    }
  }
  if (settings.med) {
    for (const m of state.meds.filter((x) => x.intervalH > 0)) {
      const last = state.entries
        .filter((e) => e.type === 'medicine' && e.medName === m.name)
        .sort((a, b) => b.start - a.start)[0]
      if (!last || now - last.start > 2 * 24 * HOUR) continue
      out.push({
        key: `med-${last.id}`,
        at: last.start + m.intervalH * HOUR,
        until: last.start + m.intervalH * HOUR + HOUR,
        title: `💊 ${m.name}`,
        body: `Die nächste Gabe ist ab jetzt möglich (letzte um ${fmtTime(last.start)}).`,
      })
    }
  }
  return out
}

function check() {
  if (!notifySupported || Notification.permission !== 'granted') return
  const now = Date.now()
  let fired: string[] = []
  try {
    fired = JSON.parse(localStorage.getItem(LS_FIRED) ?? '[]')
  } catch {
    /* leer */
  }
  let changed = false
  for (const d of upcoming(now)) {
    // nur auslösen, wenn der Zeitpunkt erreicht und das Fenster noch nicht vorbei ist
    if (now >= d.at && now <= Math.max(d.until, d.at + 20 * MIN) && !fired.includes(d.key)) {
      void show(d.title, d.body, d.key)
      fired.push(d.key)
      changed = true
    }
  }
  if (changed) {
    try {
      localStorage.setItem(LS_FIRED, JSON.stringify(fired.slice(-100)))
    } catch {
      /* ignorieren */
    }
  }
}

/** Startet die Prüfung (alle 30 s, sobald Erinnerungen aktiv sind). */
export function useReminders() {
  const s = useNotifySettings()
  const active = s.sleep || s.feed || s.med
  useEffect(() => {
    if (!active) return
    check()
    const t = setInterval(check, 30_000)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active, s.lead])
}
