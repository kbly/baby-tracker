export type EntryType =
  | 'sleep'
  | 'wake'
  | 'nightwake'
  | 'breast'
  | 'bottle'
  | 'solids'
  | 'diaper'
  | 'medicine'
  | 'pump'
  | 'growth'
  | 'note'

export type Side = 'L' | 'R' | 'both'
export type SleepKind = 'nap' | 'night'
export type DiaperKind = 'wet' | 'dirty' | 'both'

export interface Entry {
  id: string
  type: EntryType
  /** Startzeit (ms). Für Ereignisse ohne Dauer = Zeitpunkt. */
  start: number
  /** Endzeit (ms). Fehlt bei laufendem Timer. */
  end?: number
  /** Nickerchen oder Nachtschlaf (nur bei type 'sleep') */
  sleepKind?: SleepKind
  side?: Side
  amountMl?: number
  content?: string
  food?: string
  amount?: string
  diaper?: DiaperKind
  medName?: string
  dose?: string
  weightKg?: number
  heightCm?: number
  headCm?: number
  note?: string
}

export interface Baby {
  name: string
  /** ISO-Datum yyyy-mm-dd */
  birth: string
}

export interface MedPreset {
  name: string
  dose: string
  /** Mindestabstand zwischen zwei Gaben in Stunden */
  intervalH: number
}

export interface AppState {
  version: 1
  baby: Baby
  entries: Entry[]
  meds: MedPreset[]
}

export interface TypeMeta {
  label: string
  emoji: string
  color: string
  /** Hat eine Dauer (Timer möglich) */
  timed: boolean
}

export const TYPES: Record<EntryType, TypeMeta> = {
  sleep: { label: 'Schlaf', emoji: '😴', color: 'var(--c-sleep)', timed: true },
  wake: { label: 'Aufgewacht', emoji: '🌤️', color: 'var(--c-wake)', timed: false },
  nightwake: { label: 'Nächtliches Aufwachen', emoji: '🦉', color: 'var(--c-night)', timed: true },
  breast: { label: 'Stillen', emoji: '🤱', color: 'var(--c-breast)', timed: true },
  bottle: { label: 'Fläschchen', emoji: '🍼', color: 'var(--c-bottle)', timed: false },
  solids: { label: 'Beikost', emoji: '🥣', color: 'var(--c-solids)', timed: false },
  diaper: { label: 'Windel', emoji: '🧷', color: 'var(--c-diaper)', timed: false },
  medicine: { label: 'Medizin', emoji: '💊', color: 'var(--c-med)', timed: false },
  pump: { label: 'Abpumpen', emoji: '🥛', color: 'var(--c-pump)', timed: true },
  growth: { label: 'Wachstum', emoji: '📏', color: 'var(--c-growth)', timed: false },
  note: { label: 'Notiz', emoji: '📝', color: 'var(--c-note)', timed: false },
}

export const TYPE_ORDER: EntryType[] = [
  'sleep', 'wake', 'nightwake', 'breast', 'bottle', 'diaper', 'solids', 'medicine', 'pump', 'growth', 'note',
]

/** Nickerchen oder Nachtschlaf – ältere Einträge ohne Angabe werden nach Uhrzeit eingeordnet. */
export function sleepKindOf(e: Entry): SleepKind {
  if (e.sleepKind) return e.sleepKind
  const h = new Date(e.start).getHours()
  return h >= 18 || h < 6 ? 'night' : 'nap'
}

/** Anzeigename und Symbol eines Eintrags (Schlaf je nach Art). */
export function entryMeta(e: Entry): TypeMeta {
  const m = TYPES[e.type]
  if (e.type !== 'sleep') return m
  return sleepKindOf(e) === 'night'
    ? { ...m, label: 'Nachtschlaf', emoji: '🌙', color: 'var(--c-night)' }
    : { ...m, label: 'Nickerchen' }
}
