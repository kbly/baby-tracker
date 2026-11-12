import { useMemo, useState } from 'react'
import { actions, useStore } from '../store'
import { describe, fmtTime } from '../utils'
import { entryMeta } from '../types'
import type { Entry } from '../types'
import {
  buildEntries, FIELD_LABELS, guessMapping, guessTarget, isDuplicate, TARGET_LABELS,
} from '../csv'
import type { DateOrder, Field, ImportConfig, Target } from '../csv'

interface Props {
  fileName: string
  rows: string[][]
  onClose: () => void
}

const FIELDS = Object.keys(FIELD_LABELS) as Field[]
const TARGETS = Object.keys(TARGET_LABELS) as Target[]

export default function CsvImport({ fileName, rows, onClose }: Props) {
  const state = useStore()
  const header = rows[0] ?? []
  const data = rows.slice(1)
  const [map, setMap] = useState(() => guessMapping(header, rows[1]))
  const [dateOrder, setDateOrder] = useState<DateOrder>('auto')
  const [fixedType, setFixedType] = useState<Target>('note')
  const [showAll, setShowAll] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  const typeValues = useMemo(() => {
    if (map.type === undefined) return []
    const counts = new Map<string, number>()
    for (const r of data) {
      const v = r[map.type] ?? ''
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data, map.type])

  const [targets, setTargets] = useState<Record<string, Target>>({})
  const effectiveTargets = useMemo(() => {
    const t: Record<string, Target> = {}
    for (const [v] of typeValues) t[v] = targets[v] ?? guessTarget(v)
    return t
  }, [typeValues, targets])

  const cfg: ImportConfig = { map, targets: effectiveTargets, dateOrder, fixedType }
  const result = useMemo(() => buildEntries(data, cfg), [data, map, effectiveTargets, dateOrder, fixedType]) // eslint-disable-line
  const fresh = useMemo(() => result.entries.filter((e) => !isDuplicate(e, state.entries)), [result, state.entries])
  const dupes = result.entries.length - fresh.length
  const missingRequired = map.start === undefined

  function doImport() {
    const n = actions.addEntries(fresh)
    setDone(n)
  }

  const setField = (f: Field, v: string) => setMap((m) => ({ ...m, [f]: v === '' ? undefined : Number(v) }))
  const shownFields = showAll ? FIELDS : FIELDS.filter((f) => ['type', 'start', 'end', 'duration'].includes(f) || map[f] !== undefined)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import">
        <div className="sheet-head">
          <span className="badge" style={{ background: 'var(--accent)' }}>⬆</span>
          <h2>Import: {fileName}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">✕</button>
        </div>

        {done !== null ? (
          <>
            <p>✅ {done} Einträge wurden importiert.</p>
            <button className="primary" onClick={onClose}>Fertig</button>
          </>
        ) : (
          <>
            <p className="hint">{data.length} Zeilen gefunden. Prüfe, welche Spalte was bedeutet – die App hat einen Vorschlag gemacht.</p>

            <h3 className="sub">1. Spalten zuordnen</h3>
            <div className="map-grid">
              {shownFields.map((f) => (
                <label key={f} className="field">
                  <span>{FIELD_LABELS[f]}</span>
                  <select value={map[f] ?? ''} onChange={(e) => setField(f, e.target.value)}>
                    <option value="">—</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>{h || `Spalte ${i + 1}`}{data[0]?.[i] ? ` (z. B. ${data[0][i].slice(0, 20)})` : ''}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Weniger Felder' : 'Alle Felder anzeigen'}</button>

            <label className="field">
              <span>Datumsformat</span>
              <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
                <option value="auto">Automatisch erkennen</option>
                <option value="dmy">Tag.Monat.Jahr (31.12.2026)</option>
                <option value="mdy">Monat/Tag/Jahr (12/31/2026)</option>
              </select>
            </label>

            <h3 className="sub">2. Typen zuordnen</h3>
            {map.type === undefined ? (
              <label className="field">
                <span>Keine Typ-Spalte – alle Zeilen importieren als</span>
                <select value={fixedType} onChange={(e) => setFixedType(e.target.value as Target)}>
                  {TARGETS.map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
                </select>
              </label>
            ) : (
              <div className="type-map">
                {typeValues.slice(0, 40).map(([v, n]) => (
                  <label key={v} className="type-row">
                    <span>{v || '(leer)'} <small>{n}×</small></span>
                    <select value={effectiveTargets[v]} onChange={(e) => setTargets((t) => ({ ...t, [v]: e.target.value as Target }))}>
                      {TARGETS.map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}

            <h3 className="sub">3. Vorschau</h3>
            {missingRequired ? (
              <p className="error">Bitte die Spalte für „Start / Datum“ auswählen.</p>
            ) : (
              <>
                <ul className="timeline preview">
                  {fresh.slice(0, 6).map((e, i) => {
                    const m = entryMeta(e as Entry)
                    return (
                      <li key={i} className="tl-item">
                        <span className="tl-time">{new Date(e.start).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}<small>{fmtTime(e.start)}</small></span>
                        <span className="badge" style={{ background: m.color }}>{m.emoji}</span>
                        <span className="tl-body"><strong>{m.label}</strong><span>{describe({ ...e, id: '' } as Entry)}</span></span>
                      </li>
                    )
                  })}
                </ul>
                <p className="hint">
                  {fresh.length} neue Einträge
                  {dupes ? ` · ${dupes} schon vorhanden (werden übersprungen)` : ''}
                  {result.skipped ? ` · ${result.skipped} ignoriert` : ''}
                  {result.errors ? ` · ${result.errors} ohne lesbares Datum` : ''}
                </p>
              </>
            )}

            <div className="actions">
              <button className="primary" disabled={missingRequired || fresh.length === 0} onClick={doImport}>
                {fresh.length} Einträge importieren
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
