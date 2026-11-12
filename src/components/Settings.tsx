import { useRef, useState } from 'react'
import { actions, useStore } from '../store'
import type { AppState } from '../types'
import { download } from '../utils'
import { demoState } from '../demo'
import SyncPanel from './SyncPanel'
import { useSync } from '../sync'

export default function Settings() {
  const state = useStore()
  const sync = useSync()
  const shared = Boolean(sync.family && sync.email)
  const alsoOther = shared ? ' Das betrifft auch das Handy deines Partners.' : ''
  const [name, setName] = useState(state.baby.name)
  const [birth, setBirth] = useState(state.baby.birth)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function saveBaby() {
    actions.setBaby({ name: name.trim(), birth })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function exportData() {
    const date = new Date().toISOString().slice(0, 10)
    download(`baby-tracker-${date}.json`, JSON.stringify(state, null, 2))
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text()) as AppState
      if (!Array.isArray(data.entries)) throw new Error('Ungültige Datei')
      if (confirm(`${data.entries.length} Einträge importieren? Die aktuellen Daten werden ersetzt.${alsoOther}`)) {
        actions.replaceAll(data)
        setName(data.baby?.name ?? '')
        setBirth(data.baby?.birth ?? '')
      }
    } catch {
      alert('Die Datei konnte nicht gelesen werden.')
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Baby</h2>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" /></label>
        <label className="field"><span>Geburtsdatum</span><input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></label>
        <p className="hint">Das Geburtsdatum wird für die altersgerechte Schlafvorhersage (Wachfenster) verwendet.</p>
        <button className="primary" onClick={saveBaby}>{saved ? '✓ Gespeichert' : 'Speichern'}</button>
      </section>

      <SyncPanel />

      <section className="panel">
        <h2>Medikamente</h2>
        {state.meds.length === 0 ? (
          <p className="hint">Medikamente werden automatisch gespeichert, sobald du eine Gabe einträgst.</p>
        ) : (
          <ul className="med-list">
            {state.meds.map((m) => (
              <li key={m.name}>
                <span><strong>{m.name}</strong> {m.dose && `· ${m.dose}`} {m.intervalH ? `· alle ${m.intervalH} h` : ''}</span>
                <button className="ghost" onClick={() => actions.deleteMed(m.name)}>Entfernen</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Daten</h2>
        <p className="hint">{shared ? 'Die Daten werden mit deiner Familie abgeglichen und zusätzlich auf diesem Gerät gespeichert.' : 'Alle Daten bleiben nur auf diesem Gerät gespeichert. Erstelle regelmäßig eine Sicherung.'}</p>
        <div className="btn-col">
          <button className="ghost" onClick={exportData}>⬇ Sicherung exportieren (JSON)</button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>⬆ Sicherung importieren</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          <button className="ghost" onClick={() => {
            if (confirm(`Beispieldaten laden? Die aktuellen Daten werden ersetzt.${alsoOther}`)) {
              const d = demoState()
              actions.replaceAll(d)
              setName(d.baby.name)
              setBirth(d.baby.birth)
            }
          }}>✨ Beispieldaten laden</button>
          <button className="danger" onClick={() => {
            if (confirm(`Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.${alsoOther}`)) {
              actions.reset()
              setName('')
              setBirth('')
            }
          }}>Alle Daten löschen</button>
        </div>
      </section>

      <p className="hint center">
        Die Schlafvorhersage basiert auf allgemeinen Richtwerten und ersetzt keine ärztliche Beratung.
      </p>
    </>
  )
}
