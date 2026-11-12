import { useState } from 'react'
import type { Entry, EntryType } from '../types'
import { TYPES, TYPE_ORDER } from '../types'
import { actions, useNow, useStore } from '../store'
import {
  addDays, DAY, fmtDay, fmtDur, fmtTime, lastOf, overlap, predictSleep, sideLabel, startOfDay, HOUR,
} from '../utils'
import Timeline from './Timeline'

interface Props {
  onOpen: (type: EntryType, entry?: Entry) => void
}

export default function Today({ onOpen }: Props) {
  const state = useStore()
  const now = useNow(1000)
  const [day, setDay] = useState(() => startOfDay(Date.now()))
  const running = state.entries.filter((e) => TYPES[e.type].timed && e.end === undefined)

  const dayEnd = day + DAY
  const dayEntries = state.entries
    .filter((e) => e.start < dayEnd && (e.end ?? (TYPES[e.type].timed ? now : e.start)) >= day)
    .sort((a, b) => b.start - a.start)

  const sleepMs = dayEntries.filter((e) => e.type === 'sleep').reduce((s, e) => s + overlap(e, day, dayEnd, now), 0)
  const feeds = dayEntries.filter((e) => (e.type === 'breast' || e.type === 'bottle') && e.start >= day).length
  const bottleMl = dayEntries.filter((e) => e.type === 'bottle' && e.start >= day).reduce((s, e) => s + (e.amountMl ?? 0), 0)
  const diapers = dayEntries.filter((e) => e.type === 'diaper').length

  const prediction = predictSleep(state, now)
  const lastFeed = lastOf(state, ['breast', 'bottle', 'solids'])
  const lastDiaper = lastOf(state, ['diaper'])

  // Medikamente: wann ist die nächste Gabe frühestens möglich?
  const medStatus = state.meds
    .filter((m) => m.intervalH > 0)
    .map((m) => {
      const last = state.entries
        .filter((e) => e.type === 'medicine' && e.medName === m.name)
        .sort((a, b) => b.start - a.start)[0]
      return { med: m, last, next: last ? last.start + m.intervalH * HOUR : undefined }
    })
    .filter((x) => x.last && now - x.last.start < 2 * DAY)

  function tapTile(type: EntryType) {
    const r = running.find((e) => e.type === type)
    if (r) actions.updateEntry(r.id, { end: Date.now() })
    else if (type === 'sleep') actions.addEntry({ type: 'sleep', start: Date.now() })
    else onOpen(type)
  }

  function switchSide(e: Entry) {
    const t = Date.now()
    actions.updateEntry(e.id, { end: t })
    actions.addEntry({ type: e.type, start: t, side: e.side === 'L' ? 'R' : 'L' })
  }

  return (
    <>
      {running.length > 0 && (
        <section className="timers">
          {running.map((e) => {
            const meta = TYPES[e.type]
            return (
              <div key={e.id} className="timer" style={{ borderColor: meta.color }}>
                <span className="badge big" style={{ background: meta.color }}>{meta.emoji}</span>
                <div className="timer-info">
                  <span>{meta.label}{e.side ? ` · ${sideLabel(e.side)}` : ''} seit {fmtTime(e.start)}</span>
                  <strong className="clock">{fmtDur(now - e.start, true)}</strong>
                </div>
                <div className="timer-actions">
                  {(e.type === 'breast' || e.type === 'pump') && e.side !== 'both' && (
                    <button className="ghost" onClick={() => switchSide(e)}>⇄ Seite</button>
                  )}
                  <button className="ghost" onClick={() => onOpen(e.type, e)}>✎</button>
                  <button className="stop" style={{ background: meta.color }} onClick={() => actions.updateEntry(e.id, { end: Date.now() })}>
                    ■ Stopp
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      )}

      <section className="cards">
        <div className="card wide sleep-card">
          {prediction?.sleeping ? (
            <>
              <span className="label">😴 Schläft seit</span>
              <strong>{fmtDur(now - prediction.since)}</strong>
              <small>eingeschlafen um {fmtTime(prediction.since)}</small>
            </>
          ) : prediction ? (
            <>
              <span className="label">☀️ Wach seit {fmtDur(now - prediction.since)}</span>
              {prediction.windowFrom && prediction.windowTo ? (
                <>
                  <strong>
                    Nächster Schlaf: {fmtTime(prediction.windowFrom)} – {fmtTime(prediction.windowTo)}
                  </strong>
                  <SleepBar from={prediction.since} a={prediction.windowFrom} b={prediction.windowTo} now={now} />
                  <small>
                    {now > prediction.windowTo
                      ? 'Das Wachfenster ist überschritten – auf Müdigkeitszeichen achten.'
                      : now >= prediction.windowFrom
                        ? 'Jetzt ist ein guter Zeitpunkt für den nächsten Schlaf.'
                        : `Typisches Wachfenster in diesem Alter: ${prediction.wakeWindowMin![0]}–${prediction.wakeWindowMin![1]} min`}
                  </small>
                </>
              ) : (
                <small>Geburtsdatum unter „Mehr“ eintragen, um eine Schlafvorhersage zu erhalten.</small>
              )}
            </>
          ) : (
            <>
              <span className="label">😴 Schlafvorhersage</span>
              <small>Trage den ersten Schlaf ein – danach schlägt die App das nächste Schlaffenster vor.</small>
            </>
          )}
        </div>
        <div className="card">
          <span className="label">🍼 Letzte Mahlzeit</span>
          <strong>{lastFeed ? `vor ${fmtDur(now - (lastFeed.end ?? lastFeed.start))}` : '–'}</strong>
          <small>{lastFeed ? `${TYPES[lastFeed.type].label} um ${fmtTime(lastFeed.start)}` : 'noch nichts erfasst'}</small>
        </div>
        <div className="card">
          <span className="label">🧷 Letzte Windel</span>
          <strong>{lastDiaper ? `vor ${fmtDur(now - lastDiaper.start)}` : '–'}</strong>
          <small>{lastDiaper ? `um ${fmtTime(lastDiaper.start)}` : 'noch nichts erfasst'}</small>
        </div>
        {medStatus.map(({ med, last, next }) => (
          <div key={med.name} className="card wide med-card">
            <span className="label">💊 {med.name}</span>
            <strong>
              {next! <= now ? 'Nächste Gabe möglich' : `Nächste Gabe ab ${fmtTime(next!)}`}
            </strong>
            <small>Zuletzt {fmtDay(last!.start).toLowerCase()} um {fmtTime(last!.start)}{last!.dose ? ` (${last!.dose})` : ''} · Abstand {med.intervalH} h</small>
          </div>
        ))}
      </section>

      <section className="grid">
        {TYPE_ORDER.map((t) => {
          const meta = TYPES[t]
          const r = running.find((e) => e.type === t)
          return (
            <button key={t} className={`tile ${r ? 'active' : ''}`} onClick={() => tapTile(t)} style={{ ['--tile' as string]: meta.color }}>
              <span className="tile-emoji">{meta.emoji}</span>
              <span>{r ? (t === 'sleep' ? 'Aufgewacht' : 'Stopp') : meta.label}</span>
            </button>
          )
        })}
      </section>

      <section>
        <div className="day-nav">
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Vorheriger Tag">‹</button>
          <h2>{fmtDay(day)}</h2>
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} disabled={day >= startOfDay(now)} aria-label="Nächster Tag">›</button>
        </div>
        <div className="summary">
          <span>😴 {fmtDur(sleepMs)}</span>
          <span>🍼 {feeds}×{bottleMl ? ` · ${bottleMl} ml` : ''}</span>
          <span>🧷 {diapers}×</span>
        </div>
        <Timeline entries={dayEntries} now={now} onEdit={(e) => onOpen(e.type, e)} />
      </section>
    </>
  )
}

function SleepBar({ from, a, b, now }: { from: number; a: number; b: number; now: number }) {
  const end = Math.max(b + (b - a) * 0.3, now)
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / (end - from)) * 100))}%`
  return (
    <div className="sleepbar" aria-hidden>
      <div className="sleepbar-window" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />
      <div className="sleepbar-now" style={{ left: pct(now) }} />
    </div>
  )
}
