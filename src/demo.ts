import type { AppState, Entry } from './types'
import { uid } from './store'
import { addDays, startOfDay, HOUR, MIN } from './utils'

/** Erzeugt realistische Beispieldaten für die letzten Tage (zum Ausprobieren). */
export function demoState(): AppState {
  const now = Date.now()
  const birth = new Date(addDays(now, -16 * 7))
  const entries: Entry[] = []
  const add = (e: Omit<Entry, 'id'>) => {
    if (e.start >= now) return
    if (e.end !== undefined && e.end > now) e = { ...e, end: undefined }
    entries.push({ ...e, id: uid() })
  }
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)

  for (let d = 7; d >= 0; d--) {
    const day = startOfDay(addDays(now, -d))
    // Morgens aufwachen
    let t = day + rnd(6.3, 7.2) * HOUR
    add({ type: 'wake', start: t })
    // 4 Nickerchen
    for (let n = 0; n < 4; n++) {
      t += rnd(85, 115) * MIN
      const len = rnd(35, 100) * MIN
      add({ type: 'sleep', sleepKind: 'nap', start: t, end: t + len })
      t += len
    }
    // Schlafenszeit, eine nächtliche Wachphase, morgens bis zum nächsten Tag
    const bed = Math.max(t + 100 * MIN, day + 19.3 * HOUR)
    const wakeAt = day + rnd(24, 26) * HOUR
    const back = wakeAt + rnd(10, 25) * MIN
    const morning = day + DAY_H + rnd(6.3, 7.2) * HOUR
    add({ type: 'sleep', sleepKind: 'night', start: bed, end: wakeAt })
    add({ type: 'nightwake', start: wakeAt, end: back })
    add({ type: 'sleep', sleepKind: 'night', start: back, end: Math.min(morning, day + 31 * HOUR) })

    // Mahlzeiten etwa alle 3 h
    for (let h = 6.5; h < 23; h += rnd(2.5, 3.5)) {
      const s = day + h * HOUR
      if (Math.random() < 0.6) add({ type: 'breast', start: s, end: s + rnd(8, 20) * MIN, side: Math.random() < 0.5 ? 'L' : 'R' })
      else add({ type: 'bottle', start: s, amountMl: Math.round(rnd(9, 15)) * 10, content: 'Pre-Nahrung' })
      if (Math.random() < 0.8) add({ type: 'diaper', start: s + 5 * MIN, diaper: Math.random() < 0.7 ? 'wet' : 'both' })
    }
    add({ type: 'medicine', start: day + 8.5 * HOUR, medName: 'Vitamin D', dose: '1 Tablette' })
    if (d === 2) add({ type: 'growth', start: day + 11 * HOUR, weightKg: 6.2, heightCm: 61, headCm: 40.5 })
  }
  // Höchstens ein laufender Schlaf-Timer (der jüngste)
  const open = entries.filter((e) => (e.type === 'sleep' || e.type === 'nightwake') && e.end === undefined).sort((a, b) => a.start - b.start)
  open.slice(0, -1).forEach((e) => (e.end = Math.min(now, e.start + HOUR)))
  // Abgeschlossene Wachphasen nach dem laufenden Schlaf entfernen
  return {
    version: 1,
    baby: { name: 'Mia', birth: birth.toISOString().slice(0, 10) },
    entries: entries.filter((e) => e.end === undefined || e.end > e.start),
    meds: [
      { name: 'Vitamin D', dose: '1 Tablette', intervalH: 24 },
      { name: 'Paracetamol Zäpfchen', dose: '75 mg', intervalH: 6 },
    ],
  }
}

const DAY_H = 24 * HOUR
