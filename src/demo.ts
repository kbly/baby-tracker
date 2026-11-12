import type { AppState, Entry } from './types'
import { uid } from './store'
import { addDays, startOfDay, HOUR, MIN } from './utils'

/** Erzeugt realistische Beispieldaten für die letzten 7 Tage (zum Ausprobieren). */
export function demoState(): AppState {
  const now = Date.now()
  const birth = new Date(addDays(now, -16 * 7))
  const entries: Entry[] = []
  const add = (e: Omit<Entry, 'id'>) => { if (e.start <= now) entries.push({ ...e, id: uid() }) }
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)

  for (let d = 7; d >= 0; d--) {
    const day = startOfDay(addDays(now, -d))
    // Nachtschlaf vom Vortag bis morgens mit einer Unterbrechung
    let t = day + rnd(6.3, 7.2) * HOUR
    // Tagschläfe
    const naps = 4
    for (let n = 0; n < naps; n++) {
      t += rnd(85, 120) * MIN // Wachfenster
      const napLen = rnd(35, 110) * MIN
      if (t + napLen < now) add({ type: 'sleep', start: t, end: t + napLen })
      t += napLen
    }
    // Nacht
    const bed = day + rnd(19.2, 20) * HOUR
    const wake1 = day + rnd(23.5, 25.5) * HOUR
    const back = wake1 + rnd(15, 30) * MIN
    const morning = day + DAYH(rnd(30.3, 31.2))
    if (bed < now) add({ type: 'sleep', start: bed, end: Math.min(wake1, now) === wake1 ? wake1 : undefined })
    if (back < now) add({ type: 'sleep', start: back, end: morning < now ? morning : undefined })

    // Mahlzeiten alle ~3 h
    for (let h = 6.5; h < 24; h += rnd(2.5, 3.5)) {
      const s = day + h * HOUR
      if (Math.random() < 0.6) {
        add({ type: 'breast', start: s, end: s + rnd(8, 20) * MIN, side: Math.random() < 0.5 ? 'L' : 'R' })
      } else {
        add({ type: 'bottle', start: s, amountMl: Math.round(rnd(9, 15)) * 10, content: 'Pre-Nahrung' })
      }
      if (Math.random() < 0.8) {
        add({ type: 'diaper', start: s + 5 * MIN, diaper: Math.random() < 0.7 ? 'wet' : 'both' })
      }
    }
    if (d === 2) {
      add({ type: 'medicine', start: day + 9 * HOUR, medName: 'Vitamin D', dose: '1 Tablette' })
      add({ type: 'growth', start: day + 11 * HOUR, weightKg: 6.2, heightCm: 61, headCm: 40.5 })
    }
    add({ type: 'medicine', start: day + 8.5 * HOUR, medName: 'Vitamin D', dose: '1 Tablette' })
  }
  // Laufende Schlaf-Einträge in der Vergangenheit schließen, außer dem jüngsten
  const sleeps = entries.filter((e) => e.type === 'sleep' && e.end === undefined)
  sleeps.slice(0, -1).forEach((e) => (e.end = e.start + 2 * HOUR))
  // Sicherheit: kein laufender Timer im Demo
  entries.forEach((e) => { if (e.type === 'sleep' && e.end === undefined) e.end = Math.min(now - 10 * MIN, e.start + 3 * HOUR) })
  return {
    version: 1,
    baby: { name: 'Mia', birth: birth.toISOString().slice(0, 10) },
    entries: entries.filter((e) => e.end === undefined || e.end > e.start),
    meds: [{ name: 'Vitamin D', dose: '1 Tablette', intervalH: 24 }, { name: 'Paracetamol Zäpfchen', dose: '75 mg', intervalH: 6 }],
  }
}

function DAYH(h: number) { return h * HOUR }
