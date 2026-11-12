import type { AppState, Entry } from './types'

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDur(ms: number, withSeconds = false) {
  if (ms < 0) ms = 0
  const totalMin = Math.floor(ms / MIN)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (withSeconds) {
    const s = Math.floor((ms % MIN) / 1000)
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  }
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(ts: number, days: number) {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function fmtDay(ts: number) {
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  if (day === today) return 'Heute'
  if (day === addDays(today, -1)) return 'Gestern'
  if (day === addDays(today, 1)) return 'Morgen'
  return new Date(ts).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

/** Wert für <input type="datetime-local"> */
export function toLocalInput(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(v: string): number | undefined {
  if (!v) return undefined
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? undefined : t
}

export function ageInDays(birth: string, now = Date.now()) {
  if (!birth) return undefined
  const b = new Date(birth + 'T00:00:00').getTime()
  if (Number.isNaN(b)) return undefined
  return Math.floor((startOfDay(now) - b) / DAY)
}

export function ageText(birth: string, now = Date.now()) {
  const days = ageInDays(birth, now)
  if (days === undefined || days < 0) return ''
  if (days < 7) return `${days} ${days === 1 ? 'Tag' : 'Tage'}`
  const b = new Date(birth + 'T00:00:00')
  const n = new Date(now)
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth())
  if (n.getDate() < b.getDate()) months--
  if (months < 3) {
    const w = Math.floor(days / 7)
    const d = days % 7
    return `${w} Wochen${d ? ` ${d} ${d === 1 ? 'Tag' : 'Tage'}` : ''}`
  }
  if (months < 24) return `${months} Monate`
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${y} Jahre${m ? ` ${m} Monate` : ''}`
}

/** Überlappung eines Eintrags mit einem Zeitfenster (ms) */
export function overlap(e: Entry, from: number, to: number, now = Date.now()) {
  const s = Math.max(e.start, from)
  const en = Math.min(e.end ?? now, to)
  return Math.max(0, en - s)
}

export function sideLabel(s?: string) {
  return s === 'L' ? 'Links' : s === 'R' ? 'Rechts' : s === 'both' ? 'Beide' : ''
}

export function diaperLabel(d?: string) {
  return d === 'wet' ? 'Nass' : d === 'dirty' ? 'Stuhlgang' : d === 'both' ? 'Nass + Stuhlgang' : ''
}

export function describe(e: Entry, now = Date.now()): string {
  const dur = e.end !== undefined ? fmtDur(e.end - e.start) : `läuft seit ${fmtDur(now - e.start)}`
  switch (e.type) {
    case 'sleep':
    case 'nightwake':
      return dur
    case 'wake':
      return 'Tag beginnt'
    case 'breast':
      return [sideLabel(e.side), dur].filter(Boolean).join(' · ')
    case 'pump':
      return [sideLabel(e.side), e.amountMl ? `${e.amountMl} ml` : '', dur].filter(Boolean).join(' · ')
    case 'bottle':
      return [e.amountMl ? `${e.amountMl} ml` : '', e.content].filter(Boolean).join(' · ')
    case 'solids':
      return [e.food, e.amount].filter(Boolean).join(' · ')
    case 'diaper':
      return diaperLabel(e.diaper)
    case 'medicine':
      return [e.medName, e.dose].filter(Boolean).join(' · ')
    case 'growth':
      return [
        e.weightKg ? `${e.weightKg.toLocaleString('de-DE')} kg` : '',
        e.heightCm ? `${e.heightCm.toLocaleString('de-DE')} cm` : '',
        e.headCm ? `KU ${e.headCm.toLocaleString('de-DE')} cm` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    case 'note':
      return e.note ?? ''
  }
}

/* ---------- Schlafvorhersage über altersabhängige Wachfenster ---------- */

/** Typische Wachfenster in Minuten [min, max] nach Alter in Wochen (Richtwerte). */
const WAKE_WINDOWS: { maxWeeks: number; min: number; max: number }[] = [
  { maxWeeks: 4, min: 35, max: 60 },
  { maxWeeks: 8, min: 60, max: 90 },
  { maxWeeks: 13, min: 75, max: 105 },
  { maxWeeks: 17, min: 90, max: 120 },
  { maxWeeks: 26, min: 120, max: 150 },
  { maxWeeks: 35, min: 150, max: 180 },
  { maxWeeks: 52, min: 180, max: 240 },
  { maxWeeks: 78, min: 240, max: 330 },
  { maxWeeks: Infinity, min: 300, max: 360 },
]

export function wakeWindow(birth: string) {
  const days = ageInDays(birth)
  if (days === undefined || days < 0) return undefined
  const weeks = days / 7
  return WAKE_WINDOWS.find((w) => weeks <= w.maxWeeks)!
}

export function lastOf(state: AppState, types: Entry['type'][]) {
  let best: Entry | undefined
  for (const e of state.entries) {
    if (types.includes(e.type) && (!best || e.start > best.start)) best = e
  }
  return best
}

export function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
