import { useState } from 'react'
import type { DiaperKind, Entry, EntryType, Side } from '../types'
import { TYPES } from '../types'
import { actions, useStore } from '../store'
import { fromLocalInput, toLocalInput } from '../utils'

interface Props {
  type: EntryType
  entry?: Entry
  onClose: () => void
}

const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}
const str = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','))

export default function EntrySheet({ type, entry, onClose }: Props) {
  const state = useStore()
  const meta = TYPES[type]
  const isNew = !entry
  const [start, setStart] = useState(toLocalInput(entry?.start ?? Date.now()))
  const [end, setEnd] = useState(entry?.end ? toLocalInput(entry.end) : '')
  const [side, setSide] = useState<Side | undefined>(entry?.side ?? (type === 'breast' ? 'L' : undefined))
  const [amount, setAmount] = useState(str(entry?.amountMl))
  const [content, setContent] = useState(entry?.content ?? 'Muttermilch')
  const [food, setFood] = useState(entry?.food ?? '')
  const [foodAmount, setFoodAmount] = useState(entry?.amount ?? '')
  const [diaper, setDiaper] = useState<DiaperKind>(entry?.diaper ?? 'wet')
  const [medName, setMedName] = useState(entry?.medName ?? '')
  const [dose, setDose] = useState(entry?.dose ?? '')
  const [interval, setIntervalH] = useState(() => {
    const p = state.meds.find((m) => m.name === entry?.medName)
    return p ? String(p.intervalH) : ''
  })
  const [weight, setWeight] = useState(str(entry?.weightKg))
  const [height, setHeight] = useState(str(entry?.heightCm))
  const [head, setHead] = useState(str(entry?.headCm))
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState('')

  const startsTimer = meta.timed && !end

  function pickMed(name: string) {
    setMedName(name)
    const p = state.meds.find((m) => m.name === name)
    if (p) {
      setDose(p.dose)
      setIntervalH(String(p.intervalH))
    }
  }

  function save() {
    const s = fromLocalInput(start)
    if (s === undefined) return setError('Bitte eine gültige Startzeit angeben.')
    const e = meta.timed ? fromLocalInput(end) : undefined
    if (e !== undefined && e < s) return setError('Das Ende liegt vor dem Start.')
    if (type === 'medicine' && !medName.trim()) return setError('Bitte den Namen des Medikaments angeben.')

    const data: Omit<Entry, 'id'> = { type, start: s, end: e, note: note.trim() || undefined }
    switch (type) {
      case 'breast':
        data.side = side
        break
      case 'pump':
        data.side = side
        data.amountMl = num(amount)
        break
      case 'bottle':
        data.amountMl = num(amount)
        data.content = content
        break
      case 'solids':
        data.food = food.trim()
        data.amount = foodAmount.trim() || undefined
        break
      case 'diaper':
        data.diaper = diaper
        break
      case 'medicine':
        data.medName = medName.trim()
        data.dose = dose.trim() || undefined
        actions.saveMed({ name: medName.trim(), dose: dose.trim(), intervalH: num(interval) ?? 0 })
        break
      case 'growth':
        data.weightKg = num(weight)
        data.heightCm = num(height)
        data.headCm = num(head)
        break
    }
    if (entry) actions.updateEntry(entry.id, { ...data, end: data.end })
    else actions.addEntry(data)
    onClose()
  }

  function remove() {
    if (entry && confirm('Diesen Eintrag löschen?')) {
      actions.deleteEntry(entry.id)
      onClose()
    }
  }

  const sideButtons = (withBoth: boolean) => (
    <div className="seg">
      {(['L', 'R', ...(withBoth ? ['both'] : [])] as Side[]).map((s) => (
        <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)} type="button">
          {s === 'L' ? 'Links' : s === 'R' ? 'Rechts' : 'Beide'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={meta.label}>
        <div className="sheet-head">
          <span className="badge" style={{ background: meta.color }}>{meta.emoji}</span>
          <h2>{isNew ? meta.label : `${meta.label} bearbeiten`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">✕</button>
        </div>

        <label className="field">
          <span>{meta.timed ? 'Start' : 'Zeit'}</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>

        {meta.timed && (
          <label className="field">
            <span>Ende {isNew && <small>(leer lassen, um Timer zu starten)</small>}</span>
            <div className="row">
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              {end ? (
                <button type="button" className="ghost" onClick={() => setEnd('')}>leeren</button>
              ) : (
                <button type="button" className="ghost" onClick={() => setEnd(toLocalInput(Date.now()))}>jetzt</button>
              )}
            </div>
          </label>
        )}

        {type === 'breast' && <div className="field"><span>Seite</span>{sideButtons(true)}</div>}

        {type === 'pump' && (
          <>
            <div className="field"><span>Seite</span>{sideButtons(true)}</div>
            <label className="field">
              <span>Menge (ml)</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z. B. 80" />
            </label>
          </>
        )}

        {type === 'bottle' && (
          <>
            <label className="field">
              <span>Menge (ml)</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z. B. 120" />
            </label>
            <div className="chips">
              {[60, 90, 120, 150, 180, 210].map((v) => (
                <button key={v} type="button" className={amount === String(v) ? 'chip on' : 'chip'} onClick={() => setAmount(String(v))}>
                  {v}
                </button>
              ))}
            </div>
            <div className="field">
              <span>Inhalt</span>
              <div className="seg">
                {['Muttermilch', 'Pre-Nahrung', 'Folgemilch', 'Wasser/Tee'].map((c) => (
                  <button key={c} type="button" className={content === c ? 'on' : ''} onClick={() => setContent(c)}>{c}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {type === 'solids' && (
          <>
            <label className="field">
              <span>Was?</span>
              <input value={food} onChange={(e) => setFood(e.target.value)} placeholder="z. B. Karottenbrei" list="foods" />
              <datalist id="foods">
                {[...new Set(state.entries.filter((x) => x.food).map((x) => x.food!))].map((f) => <option key={f} value={f} />)}
              </datalist>
            </label>
            <label className="field">
              <span>Menge</span>
              <input value={foodAmount} onChange={(e) => setFoodAmount(e.target.value)} placeholder="z. B. 5 Löffel / 100 g" />
            </label>
          </>
        )}

        {type === 'diaper' && (
          <div className="field">
            <span>Art</span>
            <div className="seg">
              {(['wet', 'dirty', 'both'] as DiaperKind[]).map((d) => (
                <button key={d} type="button" className={diaper === d ? 'on' : ''} onClick={() => setDiaper(d)}>
                  {d === 'wet' ? '💧 Nass' : d === 'dirty' ? '💩 Stuhl' : '💧💩 Beides'}
                </button>
              ))}
            </div>
          </div>
        )}

        {type === 'medicine' && (
          <>
            {state.meds.length > 0 && (
              <div className="chips">
                {state.meds.map((m) => (
                  <button key={m.name} type="button" className={medName === m.name ? 'chip on' : 'chip'} onClick={() => pickMed(m.name)}>
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            <label className="field">
              <span>Medikament</span>
              <input value={medName} onChange={(e) => pickMed(e.target.value)} placeholder="z. B. Vitamin D" />
            </label>
            <div className="row2">
              <label className="field">
                <span>Dosis</span>
                <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="z. B. 2,5 ml" />
              </label>
              <label className="field">
                <span>Mindestabstand (h)</span>
                <input inputMode="decimal" value={interval} onChange={(e) => setIntervalH(e.target.value)} placeholder="z. B. 6" />
              </label>
            </div>
          </>
        )}

        {type === 'growth' && (
          <div className="row3">
            <label className="field"><span>Gewicht (kg)</span><input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
            <label className="field"><span>Größe (cm)</span><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
            <label className="field"><span>Kopf (cm)</span><input inputMode="decimal" value={head} onChange={(e) => setHead(e.target.value)} /></label>
          </div>
        )}

        <label className="field">
          <span>{type === 'note' ? 'Notiz' : 'Notiz (optional)'}</span>
          <textarea rows={type === 'note' ? 4 : 2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          {!isNew && <button className="danger" type="button" onClick={remove}>Löschen</button>}
          <button className="primary" type="button" onClick={save} style={{ background: meta.color }}>
            {isNew && startsTimer ? '▶ Timer starten' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
