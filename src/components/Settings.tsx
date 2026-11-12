import { useRef, useState } from 'react'
import { actions, useStore } from '../store'
import type { AppState } from '../types'
import { download } from '../utils'
import { parseCsv, toCsv } from '../csv'
import CsvImport from './CsvImport'
import { demoState } from '../demo'
import SyncPanel from './SyncPanel'
import NotifyPanel from './NotifyPanel'
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
  const csvRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<{ name: string; rows: string[][] } | null>(null)

  function saveBaby() {
    actions.setBaby({ name: name.trim(), birth })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function exportData() {
    const date = new Date().toISOString().slice(0, 10)
    download(`baby-tracker-${date}.json`, JSON.stringify(state, null, 2))
  }

  function exportCsv() {
    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([toCsv(state.entries)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `baby-tracker-${date}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function openCsv(file: File) {
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) throw new Error('leer')
      setCsv({ name: file.name, rows })
    } catch {
      alert('Die Datei konnte nicht gelesen werden. Bitte eine CSV-Datei wählen.')
    }
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
        <p className="hint">Das Geburtsdatum wird für die Vorhersagen verwendet, solange noch wenige eigene Einträge vorhanden sind.</p>
        <button className="primary" onClick={saveBaby}>{saved ? '✓ Gespeichert' : 'Speichern'}</button>
      </section>

      <SyncPanel />

      <NotifyPanel />

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
        <h3 className="sub">Export</h3>
        <div className="btn-col">
          <button className="ghost" onClick={exportCsv}>📄 Als Tabelle exportieren (CSV, für Excel)</button>
          <button className="ghost" onClick={exportData}>💾 Komplette Sicherung exportieren (JSON)</button>
        </div>
        <h3 className="sub">Import</h3>
        <div className="btn-col">
          <button className="ghost" onClick={() => csvRef.current?.click()}>📥 Aus Tabelle importieren (CSV, z. B. aus Napper)</button>
          <input ref={csvRef} type="file" accept=".csv,text/csv,text/plain,.txt,.tsv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openCsv(f) }} />
          <button className="ghost" onClick={() => fileRef.current?.click()}>♻️ Sicherung wiederherstellen (JSON)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importData(f) }} />
        </div>
        <p className="hint">Beim CSV-Import werden die Einträge ergänzt; bereits vorhandene (gleicher Typ und gleiche Startzeit) werden übersprungen. Eine JSON-Sicherung ersetzt dagegen alle Daten.</p>
        <h3 className="sub">Sonstiges</h3>
        <div className="btn-col">
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

      {csv && <CsvImport fileName={csv.name} rows={csv.rows} onClose={() => setCsv(null)} />}

      <p className="hint center">
        Schlaf- und Mahlzeit-Vorhersagen sind Schätzungen aus euren bisherigen Einträgen bzw. allgemeinen Richtwerten und ersetzen keine ärztliche Beratung.
      </p>
    </>
  )
}
