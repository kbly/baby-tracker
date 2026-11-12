/**
 * Vorhersagen aus den eigenen Daten des Babys:
 *  - nächster Schlaf (Nickerchen oder Schlafenszeit) aus den persönlichen Wachfenstern
 *  - übliche Schlafenszeit am Abend
 *  - nächste Mahlzeit aus den Abständen zwischen den Mahlzeiten
 * Gibt es noch zu wenige Daten, werden allgemeine Richtwerte für das Alter verwendet.
 */
import type { AppState, Entry } from './types'
import { sleepKindOf } from './types'
import { ageInDays, DAY, HOUR, MIN, startOfDay, wakeWindow } from './utils'

const LOOKBACK = 7 * DAY

export type Source = 'personal' | 'age'

export interface TimeWindow {
  /** frühester und spätester Zeitpunkt sowie wahrscheinlichster */
  from: number
  to: number
  est: number
  source: Source
  samples: number
}

export interface SleepForecast {
  state: 'sleeping' | 'night-awake' | 'awake' | 'unknown'
  /** seit wann der aktuelle Zustand besteht */
  since?: number
  night?: boolean
  /** Nächster Schlaf (nur wenn wach) */
  next?: TimeWindow & { kind: 'nap' | 'bedtime'; napNumber: number; wakeWindowMin: number }
  /** Übliche Schlafenszeit (Uhrzeit heute) */
  usualBedtime?: number
  bedtimeSamples?: number
  napsToday: number
  typicalNaps?: number
  needsBirth?: boolean
}

export interface FeedForecast {
  feeding: boolean
  last?: Entry
  next?: TimeWindow
  avgIntervalMin?: number
}

/* ---------- Statistik-Helfer ---------- */

export function quantile(values: number[], q: number) {
  const s = [...values].sort((a, b) => a - b)
  if (!s.length) return NaN
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
const median = (v: number[]) => quantile(v, 0.5)

/** Bereich aus Messwerten: Median als Schätzung, mittlere 50 % als Fenster (mind. ±10 min). */
function windowFrom(base: number, values: number[], source: Source): TimeWindow {
  const est = median(values)
  let lo = quantile(values, 0.25)
  let hi = quantile(values, 0.75)
  if (est - lo < 10 * MIN) lo = est - 10 * MIN
  if (hi - est < 10 * MIN) hi = est + 10 * MIN
  return { from: base + lo, to: base + hi, est: base + est, source, samples: values.length }
}

/* ---------- Schlaf ---------- */

interface Seg {
  start: number
  end: number
  night: boolean
}

interface WakeSample {
  /** 0 = erstes Wachfenster nach dem Aufwachen am Morgen, 1 = nach dem 1. Nickerchen … */
  index: number
  ms: number
  /** Wachfenster endet mit der Schlafenszeit */
  beforeBed: boolean
  at: number
}

/** Abgeschlossene Schlafphasen inkl. „Aufgewacht“-Einträgen ohne Schlafeintrag. */
function segments(entries: Entry[], now: number): Seg[] {
  const segs: Seg[] = entries
    .filter((e) => e.type === 'sleep' && e.end !== undefined && e.end <= now)
    .map((e) => ({ start: e.start, end: e.end!, night: sleepKindOf(e) === 'night' }))
  for (const w of entries) {
    if (w.type !== 'wake' || w.start > now) continue
    const covered = segs.some((s) => s.night && Math.abs(s.end - w.start) < 45 * MIN)
    if (!covered) segs.push({ start: w.start - 9 * HOUR, end: w.start, night: true })
  }
  return segs.sort((a, b) => a.start - b.start)
}

function wakeSamples(segs: Seg[], now: number): WakeSample[] {
  const out: WakeSample[] = []
  let naps = 0 // Nickerchen seit dem Aufwachen am Morgen (einschließlich a)
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i]
    const b = segs[i + 1]
    naps = a.night ? 0 : naps + 1
    if (a.night && b.night) continue // nächtliches Aufwachen
    const gap = b.start - a.end
    if (gap > 10 * MIN && gap < 8 * HOUR && now - a.end < LOOKBACK) {
      out.push({ index: naps, ms: gap, beforeBed: b.night, at: a.end })
    }
  }
  return out
}

/** Zählt die Nickerchen seit dem letzten Nachtschlaf. */
function napsSinceMorning(segs: Seg[]) {
  let n = 0
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i].night) break
    n++
  }
  return n
}

/** Übliche Anzahl Nickerchen pro Tag (Median der vollständigen Tage). */
function typicalNapCount(segs: Seg[], now: number) {
  const counts: number[] = []
  let n = 0
  let started = false
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.night) {
      const prevNight = i > 0 && segs[i - 1].night
      if (started && !prevNight && now - s.start < LOOKBACK) counts.push(n)
      started = true
      n = 0
    } else n++
  }
  return counts.length >= 3 ? Math.round(median(counts)) : undefined
}

/** Übliche Schlafenszeit als Minuten seit Mitternacht (Werte nach Mitternacht > 1440). */
function usualBedtimeMinutes(segs: Seg[], now: number) {
  const mins: number[] = []
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i]
    if (!s.night || segs[i - 1].night || now - s.start > LOOKBACK) continue
    const d = new Date(s.start)
    let m = d.getHours() * 60 + d.getMinutes()
    if (m < 12 * 60) m += 24 * 60
    if (m >= 15 * 60) mins.push(m)
  }
  return mins.length >= 3 ? { min: median(mins), samples: mins.length } : undefined
}

export function forecastSleep(state: AppState, now = Date.now()): SleepForecast {
  const entries = state.entries
  const segs = segments(entries, now)
  const napsToday = napsSinceMorning(segs)
  const typicalNaps = typicalNapCount(segs, now)
  const bed = usualBedtimeMinutes(segs, now)
  const today = startOfDay(now)
  const usualBedtime = bed ? today + bed.min * MIN : undefined
  const base = { napsToday, typicalNaps, usualBedtime, bedtimeSamples: bed?.samples }

  const running = entries.find((e) => e.type === 'sleep' && e.end === undefined)
  if (running) return { ...base, state: 'sleeping', since: running.start, night: sleepKindOf(running) === 'night' }
  const nw = entries.find((e) => e.type === 'nightwake' && e.end === undefined)
  if (nw) return { ...base, state: 'night-awake', since: nw.start }

  const last = segs[segs.length - 1]
  if (!last) return { ...base, state: 'unknown' }

  // Ist als Nächstes die Schlafenszeit dran?
  let isBedtime = typicalNaps !== undefined && napsToday >= typicalNaps
  const samples = wakeSamples(segs, now)

  let next: TimeWindow | undefined
  let wakeWindowMin = 0
  const pick = (f: (s: WakeSample) => boolean) => samples.filter(f).map((s) => s.ms)

  let personal = isBedtime ? pick((s) => s.beforeBed) : pick((s) => !s.beforeBed && s.index === napsToday)
  if (personal.length < 3 && !isBedtime) personal = pick((s) => !s.beforeBed)
  if (personal.length >= 3) {
    next = windowFrom(last.end, personal, 'personal')
  } else {
    const ww = wakeWindow(state.baby.birth)
    if (!ww) return { ...base, state: 'awake', since: last.end, needsBirth: true }
    let f = 1
    if (napsToday === 0) f = 0.85 // erstes Wachfenster am Morgen ist meist kürzer
    if (isBedtime) f = 1.15 // letztes Wachfenster vor der Nacht ist meist länger
    if (!last.night && last.end - last.start < 45 * MIN) f *= 0.85 // nach kurzem Nickerchen
    const lo = ww.min * f * MIN
    const hi = ww.max * f * MIN
    next = { from: last.end + lo, to: last.end + hi, est: last.end + (lo + hi) / 2, source: 'age', samples: 0 }
  }
  wakeWindowMin = Math.round((next.est - last.end) / MIN)

  // Fällt das nächste Schlaffenster in die übliche Schlafenszeit, ist es die Nacht.
  if (!isBedtime && usualBedtime && next.est >= usualBedtime - 45 * MIN) isBedtime = true
  if (isBedtime && usualBedtime && next.source === 'age') {
    next = { ...next, est: usualBedtime, from: usualBedtime - 20 * MIN, to: usualBedtime + 20 * MIN }
  }

  return {
    ...base,
    state: 'awake',
    since: last.end,
    next: { ...next, kind: isBedtime ? 'bedtime' : 'nap', napNumber: napsToday + 1, wakeWindowMin },
  }
}

/* ---------- Mahlzeiten ---------- */

const isNight = (ts: number) => {
  const h = new Date(ts).getHours()
  return h >= 20 || h < 6
}

/** Typischer Abstand zwischen Mahlzeiten nach Alter in Minuten [min, max] (Richtwerte, tagsüber). */
function ageFeedInterval(birth: string): [number, number] {
  const days = ageInDays(birth) ?? 60
  const w = days / 7
  if (w <= 4) return [120, 180]
  if (w <= 12) return [150, 210]
  if (w <= 26) return [180, 240]
  return [210, 270]
}

export function forecastFeed(state: AppState, now = Date.now()): FeedForecast {
  const raw = state.entries
    .filter((e) => (e.type === 'breast' || e.type === 'bottle') && e.start <= now)
    .sort((a, b) => a.start - b.start)
  if (!raw.length) return { feeding: false }
  const feeding = raw.some((e) => e.type === 'breast' && e.end === undefined)

  // Stillen mit Seitenwechsel / Nachschlag innerhalb von 30 min = eine Mahlzeit
  const feeds: Entry[] = []
  for (const e of raw) {
    const prev = feeds[feeds.length - 1]
    if (prev && e.start - (prev.end ?? prev.start) < 30 * MIN) continue
    feeds.push(e)
  }
  const last = feeds[feeds.length - 1]
  const night = isNight(now)

  const intervals: number[] = []
  for (let i = 0; i < feeds.length - 1; i++) {
    const a = feeds[i]
    if (now - a.start > LOOKBACK || isNight(a.start) !== night) continue
    const gap = feeds[i + 1].start - a.start
    if (gap > 45 * MIN && gap < (night ? 9 : 6) * HOUR) intervals.push(gap)
  }

  let next: TimeWindow
  if (intervals.length >= 5) {
    next = windowFrom(last.start, intervals, 'personal')
  } else {
    const [lo, hi] = ageFeedInterval(state.baby.birth).map((m) => m * MIN * (night ? 1.3 : 1))
    next = { from: last.start + lo, to: last.start + hi, est: last.start + (lo + hi) / 2, source: 'age', samples: 0 }
  }
  return {
    feeding,
    last,
    next,
    avgIntervalMin: intervals.length >= 5 ? Math.round(median(intervals) / MIN) : undefined,
  }
}
