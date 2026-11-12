/** CSV-Export und -Import (eigenes Format sowie Dateien anderer Apps über eine Spalten-Zuordnung). */
import type { DiaperKind, Entry, EntryType, Side, SleepKind } from './types'
import { MIN } from './utils'

/* ---------- Parser ---------- */

export function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const count = (c: string) => first.split(c).length - 1
  return [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0]
}

/** RFC-4180-kompatibler Parser (Anführungszeichen, Zeilenumbrüche in Feldern). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const d = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === d) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows.map((r) => r.map((f) => f.trim()))
}

/* ---------- Datum & Zahlen ---------- */

const pad = (n: number) => String(n).padStart(2, '0')
export function fmtCsvDate(ts?: number) {
  if (ts === undefined) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type DateOrder = 'auto' | 'dmy' | 'mdy'

/** Erkennt viele Formate: ISO, 12.11.2026 13:30, 11/12/2026 1:30 PM, Unix-Zeit … */
export function parseDate(v: string, order: DateOrder = 'auto'): number | undefined {
  v = v.trim()
  if (!v) return undefined
  if (/^\d{10}(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 1000)
  if (/^\d{13}$/.test(v)) return parseInt(v, 10)
  // ISO mit Zeitzone o. Ä. direkt
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && /(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    const t = Date.parse(v)
    return Number.isNaN(t) ? undefined : t
  }
  const m = v.match(
    /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/,
  )
  if (!m) {
    const t = Date.parse(v)
    return Number.isNaN(t) ? undefined : t
  }
  let [a, b, c] = [m[1], m[2], m[3]].map((x) => parseInt(x, 10))
  let y: number, mo: number, d: number
  if (m[1].length === 4) { y = a; mo = b; d = c }
  else {
    y = c < 100 ? 2000 + c : c
    const sep = v.match(/^\d{1,2}([./-])/)?.[1]
    let dmy = order === 'dmy' || (order === 'auto' && sep === '.')
    if (order === 'auto' && sep !== '.') dmy = a > 12 ? true : b > 12 ? false : sep !== '/'
    ;[d, mo] = dmy ? [a, b] : [b, a]
  }
  let h = m[4] ? parseInt(m[4], 10) : 0
  const min = m[5] ? parseInt(m[5], 10) : 0
  const s = m[6] ? parseInt(m[6], 10) : 0
  if (m[7]) {
    const pm = m[7].toLowerCase() === 'pm'
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
  }
  const t = new Date(y, mo - 1, d, h, min, s).getTime()
  return Number.isNaN(t) ? undefined : t
}

/** Uhrzeit "13:30" / "1:30 PM" zu einem Datum hinzufügen. */
export function withTime(day: number, time: string) {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/)
  if (!m) return day
  let h = parseInt(m[1], 10)
  if (m[4]) {
    const pm = m[4].toLowerCase() === 'pm'
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
  }
  const d = new Date(day)
  d.setHours(h, parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0, 0)
  return d.getTime()
}

export function parseNum(v?: string) {
  if (!v) return undefined
  const m = v.replace(/\s/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : undefined
}

/** Dauer: Minuten, "1:23", "1:23:45", "1h 23m", "83 min" → ms */
export function parseDuration(v?: string) {
  if (!v) return undefined
  v = v.trim().toLowerCase()
  let m = v.match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (m) return m[3] ? (+m[1] * 60 + +m[2]) * MIN + +m[3] * 1000 : (+m[1] * 60 + +m[2]) * MIN
  m = v.match(/(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m)?/)
  if (m && (m[1] || m[2])) return (parseFloat((m[1] ?? '0').replace(',', '.')) * 60 + parseInt(m[2] ?? '0', 10)) * MIN
  const n = parseNum(v)
  return n === undefined ? undefined : n * MIN
}

/* ---------- Export ---------- */

const TYPE_DE: Record<EntryType, string> = {
  sleep: 'Schlaf', wake: 'Aufgewacht', nightwake: 'Nachts wach', breast: 'Stillen', bottle: 'Fläschchen',
  solids: 'Beikost', diaper: 'Windel', medicine: 'Medizin', pump: 'Abpumpen', growth: 'Wachstum', note: 'Notiz',
}

export const EXPORT_HEADER = [
  'Typ', 'Art', 'Start', 'Ende', 'Dauer (min)', 'Seite', 'Menge (ml)', 'Inhalt', 'Lebensmittel', 'Menge',
  'Windel', 'Medikament', 'Dosis', 'Gewicht (kg)', 'Größe (cm)', 'Kopfumfang (cm)', 'Notiz',
]

const esc = (v: string | number | undefined) => {
  if (v === undefined || v === '') return ''
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(entries: Entry[]) {
  const rows = [...entries].sort((a, b) => a.start - b.start).map((e) => [
    TYPE_DE[e.type],
    e.type === 'sleep' ? (e.sleepKind === 'night' ? 'Nacht' : e.sleepKind === 'nap' ? 'Nickerchen' : '') : '',
    fmtCsvDate(e.start),
    fmtCsvDate(e.end),
    e.end !== undefined ? Math.round((e.end - e.start) / MIN) : undefined,
    e.side === 'L' ? 'Links' : e.side === 'R' ? 'Rechts' : e.side === 'both' ? 'Beide' : '',
    e.amountMl, e.content, e.food, e.amount,
    e.diaper === 'wet' ? 'Nass' : e.diaper === 'dirty' ? 'Stuhl' : e.diaper === 'both' ? 'Beides' : '',
    e.medName, e.dose, e.weightKg, e.heightCm, e.headCm, e.note,
  ])
  // BOM + Semikolon, damit Excel (deutsch) Umlaute und Spalten richtig erkennt
  return '﻿' + [EXPORT_HEADER, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
}

/* ---------- Import ---------- */

export type Field =
  | 'type' | 'kind' | 'start' | 'startTime' | 'end' | 'endTime' | 'duration' | 'side' | 'amountMl'
  | 'content' | 'food' | 'amount' | 'diaper' | 'medName' | 'dose' | 'weight' | 'height' | 'head' | 'note' | 'details'

export const FIELD_LABELS: Record<Field, string> = {
  type: 'Typ / Kategorie ✱', kind: 'Art (Nickerchen/Nacht)', start: 'Start / Datum ✱', startTime: 'Startzeit (falls separat)',
  end: 'Ende', endTime: 'Endzeit (falls separat)', duration: 'Dauer', side: 'Seite', amountMl: 'Menge (ml)',
  content: 'Inhalt Fläschchen', food: 'Lebensmittel', amount: 'Menge (Text)', diaper: 'Windel-Art',
  medName: 'Medikament', dose: 'Dosis', weight: 'Gewicht', height: 'Größe', head: 'Kopfumfang', note: 'Notiz',
  details: 'Details (Freitext)',
}

const GUESS: [Field, RegExp][] = [
  ['type', /^(typ|type|kategorie|category|activity|aktivität|event|ereignis|art des eintrags)$/i],
  ['kind', /^(art|sleep ?type|schlafart|kind)$/i],
  ['startTime', /^(start ?time|startzeit|uhrzeit|time|zeit)$/i],
  ['start', /^(start|beginn|begin|from|von|start(ed)?(_| )?(at|date|datum)?|datum|date|zeitpunkt|timestamp)$/i],
  ['endTime', /^(end ?time|endzeit)$/i],
  ['end', /^(ende|end|to|bis|end(ed)?(_| )?(at|date)?|finish(ed)?)$/i],
  ['duration', /(dauer|duration|länge|length)/i],
  ['side', /(seite|side|brust|breast side)/i],
  ['amountMl', /(ml|menge \(ml\)|volume|volumen|amount ?\(ml\)|quantity)/i],
  ['content', /^(inhalt|content|milk type|milchart)$/i],
  ['food', /(lebensmittel|food|essen)/i],
  ['amount', /^(menge|amount)$/i],
  ['diaper', /(windel|diaper|nappy)/i],
  ['medName', /(medikament|medicine|medication|med name)/i],
  ['dose', /(dosis|dose|dosage)/i],
  ['weight', /(gewicht|weight)/i],
  ['height', /(größe|groesse|height|length cm|körperlänge)/i],
  ['head', /(kopf|head)/i],
  ['note', /(notiz|note|notes|kommentar|comment|bemerkung)/i],
  ['details', /(detail|info|value|wert|beschreibung|description)/i],
]

const looksLikeDate = (v?: string) => !!v && /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(v)

export function guessMapping(header: string[], sample: string[] = []): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {}
  header.forEach((h, i) => {
    const name = h.trim()
    for (const [f, re] of GUESS) {
      if (map[f] === undefined && re.test(name)) { map[f] = i; break }
    }
  })
  // "Start Time" mit vollständigem Datum ist der Start, keine separate Uhrzeit
  if (map.start === undefined && map.startTime !== undefined && looksLikeDate(sample[map.startTime])) {
    map.start = map.startTime
    delete map.startTime
  }
  if (map.end === undefined && map.endTime !== undefined && looksLikeDate(sample[map.endTime])) {
    map.end = map.endTime
    delete map.endTime
  }
  return map
}

export type Target = EntryType | 'sleep-nap' | 'sleep-night' | 'skip'

export const TARGET_LABELS: Record<Target, string> = {
  'sleep-nap': 'Nickerchen', 'sleep-night': 'Nachtschlaf', sleep: 'Schlaf (automatisch)', wake: 'Aufgewacht',
  nightwake: 'Nachts wach', breast: 'Stillen', bottle: 'Fläschchen', solids: 'Beikost', diaper: 'Windel',
  medicine: 'Medizin', pump: 'Abpumpen', growth: 'Wachstum', note: 'Notiz', skip: '– ignorieren –',
}

/** Ordnet einen Typ-Wert (z. B. "Nap", "Bottle", "Diaper") einem Eintragstyp zu. */
export function guessTarget(v: string): Target {
  const s = v.toLowerCase()
  if (/nachts wach|night ?wak|wo?ke ?up (at|in the) night|night ?feed ?wake|nächtl/.test(s)) return 'nightwake'
  if (/aufgewacht|woke|wake|aufwachen|morning/.test(s)) return 'wake'
  if (/nacht|night|bedtime|schlafenszeit/.test(s)) return 'sleep-night'
  if (/nap|nickerchen|mittagsschlaf/.test(s)) return 'sleep-nap'
  if (/sleep|schlaf/.test(s)) return 'sleep'
  if (/pump/.test(s)) return 'pump'
  if (/bottle|flasche|fläschchen|formula|pre-?nahrung/.test(s)) return 'bottle'
  if (/breast|nurs|stillen|feed|füttern|mahlzeit/.test(s)) return 'breast'
  if (/solid|food|beikost|brei|meal/.test(s)) return 'solids'
  if (/diaper|nappy|windel|pee|poo|wet|dirty/.test(s)) return 'diaper'
  if (/medic|medizin|medikament|vitamin|fever|temperatur/.test(s)) return 'medicine'
  if (/weight|height|growth|gewicht|größe|wachstum|head/.test(s)) return 'growth'
  if (/note|notiz|comment/.test(s)) return 'note'
  return 'skip'
}

function sideOf(v?: string): Side | undefined {
  if (!v) return undefined
  const s = v.toLowerCase()
  if (/beid|both|l\s*[+&/]\s*r/.test(s)) return 'both'
  if (/^l\b|left|links/.test(s)) return 'L'
  if (/^r\b|right|rechts/.test(s)) return 'R'
  return undefined
}

function diaperOf(v?: string): DiaperKind {
  const s = (v ?? '').toLowerCase()
  const dirty = /poo|dirty|stuhl|kacka|bm|schmutz|mixed|both|beides/.test(s)
  const wet = /wet|pee|nass|urin|mixed|both|beides/.test(s)
  return dirty && wet ? 'both' : dirty ? 'dirty' : 'wet'
}

export interface ImportConfig {
  map: Partial<Record<Field, number>>
  targets: Record<string, Target>
  dateOrder: DateOrder
  /** Fester Typ, falls die Datei keine Typ-Spalte hat */
  fixedType?: Target
}

export interface ImportResult {
  entries: Omit<Entry, 'id'>[]
  skipped: number
  errors: number
}

export function buildEntries(rows: string[][], cfg: ImportConfig): ImportResult {
  const out: Omit<Entry, 'id'>[] = []
  let skipped = 0
  let errors = 0
  const col = (r: string[], f: Field) => (cfg.map[f] !== undefined ? r[cfg.map[f]!] ?? '' : '')
  for (const r of rows) {
    const typeVal = col(r, 'type')
    const target: Target = cfg.map.type !== undefined ? cfg.targets[typeVal] ?? 'skip' : cfg.fixedType ?? 'skip'
    if (target === 'skip') { skipped++; continue }
    let start = parseDate(col(r, 'start'), cfg.dateOrder)
    if (start !== undefined && col(r, 'startTime')) start = withTime(start, col(r, 'startTime'))
    if (start === undefined) { errors++; continue }
    let end: number | undefined
    if (col(r, 'end')) {
      end = parseDate(col(r, 'end'), cfg.dateOrder)
      if (end !== undefined && !/\d{1,2}:\d{2}/.test(col(r, 'end')) && col(r, 'endTime')) end = withTime(end, col(r, 'endTime'))
    } else if (col(r, 'endTime')) {
      end = withTime(start, col(r, 'endTime'))
      if (end < start) end += 24 * 60 * MIN // über Mitternacht
    }
    if (end === undefined) {
      const dur = parseDuration(col(r, 'duration'))
      if (dur) end = start + dur
    }
    if (end !== undefined && end < start) end = undefined

    const details = [col(r, 'details'), typeVal, col(r, 'note')].join(' ')
    let type: EntryType
    let sleepKind: SleepKind | undefined
    if (target === 'sleep-nap' || target === 'sleep-night') { type = 'sleep'; sleepKind = target === 'sleep-nap' ? 'nap' : 'night' }
    else type = target
    if (type === 'sleep' && !sleepKind && col(r, 'kind')) {
      const k = col(r, 'kind').toLowerCase()
      sleepKind = /nacht|night/.test(k) ? 'night' : /nap|nicker|tag|day/.test(k) ? 'nap' : undefined
    }

    const e: Omit<Entry, 'id'> = { type, start }
    const timed = type === 'sleep' || type === 'breast' || type === 'pump' || type === 'nightwake'
    if (timed) {
      // Ohne Ende: in den letzten 12 h als laufender Timer übernehmen, sonst 1 Minute
      if (end === undefined && Date.now() - start > 12 * 60 * MIN) end = start + MIN
      e.end = end
    }
    if (sleepKind) e.sleepKind = sleepKind
    const side = sideOf(col(r, 'side')) ?? (type === 'breast' || type === 'pump' ? sideOf(details.match(/\b(left|right|links|rechts|both|beide)\b/i)?.[0]) : undefined)
    if (side && (type === 'breast' || type === 'pump')) e.side = side
    const amountText = col(r, 'amountMl') || (cfg.map.amountMl === undefined ? col(r, 'amount') : '')
    const ml = parseNum(amountText) ?? (type === 'bottle' || type === 'pump' ? parseNum(details.match(/(\d+[.,]?\d*)\s*(ml|oz)/i)?.[1]) : undefined)
    if (ml !== undefined && (type === 'bottle' || type === 'pump')) {
      // Unzen (oz) → ml
      e.amountMl = /oz/i.test(amountText + details) ? Math.round(ml * 29.57) : ml
    }
    if (type === 'bottle' && col(r, 'content')) e.content = col(r, 'content')
    if (type === 'solids') {
      e.food = col(r, 'food') || col(r, 'details') || undefined
      e.amount = col(r, 'amount') || undefined
    }
    if (type === 'diaper') e.diaper = diaperOf(col(r, 'diaper') || details)
    let noteUsed = false
    if (type === 'medicine') {
      e.medName = col(r, 'medName') || col(r, 'details') || (col(r, 'note') ? ((noteUsed = true), col(r, 'note')) : 'Medikament')
      e.dose = col(r, 'dose') || col(r, 'amount') || col(r, 'amountMl') || undefined
    }
    if (type === 'growth') {
      e.weightKg = parseNum(col(r, 'weight'))
      if (e.weightKg && e.weightKg > 100) e.weightKg = e.weightKg / 1000 // Gramm
      e.heightCm = parseNum(col(r, 'height'))
      e.headCm = parseNum(col(r, 'head'))
    }
    const note = [noteUsed ? '' : col(r, 'note'), type === 'note' ? col(r, 'details') : ''].filter(Boolean).join(' – ')
    if (note) e.note = note
    out.push(e)
  }
  return { entries: out, skipped, errors }
}

/** Gleicher Typ und Start innerhalb einer Minute = Duplikat */
export function isDuplicate(e: Omit<Entry, 'id'>, existing: Entry[]) {
  return existing.some((x) => x.type === e.type && Math.abs(x.start - e.start) < MIN)
}
