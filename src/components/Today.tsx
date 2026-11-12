import { useState } from 'react'
import type { Entry, EntryType, SleepKind } from '../types'
import { TYPES, entryMeta, sleepKindOf } from '../types'
import { actions, useNow, useStore } from '../store'
import {
  addDays, DAY, fmtDay, fmtDur, fmtTime, lastOf, overlap, sideLabel, startOfDay, HOUR,
} from '../utils'
import Timeline from './Timeline'
import { forecastFeed, forecastSleep } from '../predict'

interface Props {
  onOpen: (type: EntryType, entry?: Entry, kind?: SleepKind) => void
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
  const naps = dayEntries.filter((e) => e.type === 'sleep' && e.start >= day && sleepKindOf(e) === 'nap').length
  const nightWakes = dayEntries.filter((e) => e.type === 'nightwake' && e.start >= day).length

  const sleep = forecastSleep(state, now)
  const feed = forecastFeed(state, now)
  const isNightNow = new Date(now).getHours() >= 20 || new Date(now).getHours() < 6
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

  const runningSleep = running.find((e) => e.type === 'sleep')
  const runningNightwake = running.find((e) => e.type === 'nightwake')

  function tapTile(type: EntryType) {
    const r = running.find((e) => e.type === type)
    if (r) actions.updateEntry(r.id, { end: Date.now() })
    else onOpen(type)
  }

  /** Schlaf-Kacheln: ein Tipp genügt, Uhrzeit = jetzt (später über den Verlauf änderbar). */
  function sleepAction(action: 'wake' | 'nap' | 'night' | 'nightwake') {
    const t = Date.now()
    if (action === 'wake') {
      // Morgens aufgewacht: laufenden Schlaf / nächtliches Aufwachen beenden
      if (runningSleep) actions.updateEntry(runningSleep.id, { end: t })
      if (runningNightwake) actions.updateEntry(runningNightwake.id, { end: t })
      if (!runningSleep || sleepKindOf(runningSleep) === 'night' || runningNightwake) {
        actions.addEntry({ type: 'wake', start: t })
      }
    } else if (action === 'night' && runningSleep && sleepKindOf(runningSleep) === 'night') {
      sleepAction('wake') // Tipp auf laufenden Nachtschlaf = morgens aufgewacht
    } else if (action === 'nap' || action === 'night') {
      if (runningSleep && sleepKindOf(runningSleep) === action) {
        actions.updateEntry(runningSleep.id, { end: t }) // Schlaf beenden
        return
      }
      if (runningSleep) actions.updateEntry(runningSleep.id, { end: t })
      if (runningNightwake) actions.updateEntry(runningNightwake.id, { end: t })
      actions.addEntry({ type: 'sleep', start: t, sleepKind: action })
    } else {
      if (runningNightwake) {
        // wieder eingeschlafen → Nachtschlaf geht weiter
        actions.updateEntry(runningNightwake.id, { end: t })
        actions.addEntry({ type: 'sleep', start: t, sleepKind: 'night' })
      } else if (runningSleep) {
        actions.updateEntry(runningSleep.id, { end: t })
        actions.addEntry({ type: 'nightwake', start: t })
      } else {
        onOpen('nightwake')
      }
    }
  }

  const napRunning = runningSleep && sleepKindOf(runningSleep) === 'nap'
  const nightRunning = runningSleep && sleepKindOf(runningSleep) === 'night'
  const sleepTiles: { id: 'wake' | 'nap' | 'night' | 'nightwake'; emoji: string; label: string; color: string; active: boolean }[] = [
    { id: 'wake', emoji: '🌤️', label: 'Aufwachen', color: 'var(--c-wake)', active: false },
    { id: 'nap', emoji: '😴', label: napRunning ? 'Nickerchen beenden' : 'Nickerchen', color: 'var(--c-sleep)', active: !!napRunning },
    { id: 'night', emoji: '🌙', label: nightRunning ? 'Nachtschlaf läuft' : 'Schlafenszeit', color: 'var(--c-night)', active: !!nightRunning },
    {
      id: 'nightwake', emoji: '🦉',
      label: runningNightwake ? 'Wieder eingeschlafen' : 'Nachts wach',
      color: 'var(--c-night)', active: !!runningNightwake,
    },
  ]
  const otherTiles: EntryType[] = ['breast', 'bottle', 'diaper', 'solids', 'medicine', 'pump', 'growth', 'note']

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
            const meta = entryMeta(e)
            return (
              <div key={e.id} className="timer" style={{ borderColor: meta.color }}>
                <span className="badge big" style={{ background: meta.color }}>{meta.emoji}</span>
                <div className="timer-info">
                  <span>{meta.label}{e.side ? ` · ${sideLabel(e.side)}` : ''} seit {fmtTime(e.start)}</span>
                  <strong className="clock">{fmtDur(now - e.start, true)}</strong>
                </div>
                <div className="timer-actions">
                  {nightRunning && e.id === runningSleep?.id && (
                    <button className="ghost" onClick={() => sleepAction('nightwake')}>🦉 Nachts wach</button>
                  )}
                  {(e.type === 'breast' || e.type === 'pump') && e.side !== 'both' && (
                    <button className="ghost" onClick={() => switchSide(e)}>⇄ Seite</button>
                  )}
                  <button className="ghost" onClick={() => onOpen(e.type, e)}>✎</button>
                  {e.type === 'nightwake' ? (
                    <button className="stop" style={{ background: meta.color }} onClick={() => sleepAction('nightwake')}>
                      🌙 Schläft wieder
                    </button>
                  ) : e.type === 'sleep' ? (
                    <button className="stop" style={{ background: meta.color }} onClick={() => sleepAction(sleepKindOf(e) === 'night' ? 'wake' : 'nap')}>
                      🌤️ Aufgewacht
                    </button>
                  ) : (
                    <button className="stop" style={{ background: meta.color }} onClick={() => actions.updateEntry(e.id, { end: Date.now() })}>
                      ■ Stopp
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      <section className="cards">
        <div className="card wide sleep-card">
          {sleep.state === 'night-awake' ? (
            <>
              <span className="label">🦉 Nachts wach seit</span>
              <strong>{fmtDur(now - sleep.since!)}</strong>
              <small>aufgewacht um {fmtTime(sleep.since!)}</small>
            </>
          ) : sleep.state === 'sleeping' ? (
            <>
              <span className="label">{sleep.night ? '🌙 Nachtschlaf seit' : '😴 Nickerchen seit'}</span>
              <strong>{fmtDur(now - sleep.since!)}</strong>
              <small>eingeschlafen um {fmtTime(sleep.since!)}</small>
            </>
          ) : sleep.state === 'awake' && sleep.next ? (
            <>
              <span className="label">☀️ Wach seit {fmtDur(now - sleep.since!)}</span>
              <strong>
                {sleep.next.kind === 'bedtime' ? '🌙 Schlafenszeit' : `😴 ${sleep.next.napNumber}. Nickerchen`} ca. {fmtTime(sleep.next.est)}
              </strong>
              <TimeBar from={sleep.since!} a={sleep.next.from} b={sleep.next.to} now={now} />
              <small>
                {now > sleep.next.to
                  ? 'Das Schlaffenster ist überschritten – auf Müdigkeitszeichen achten.'
                  : now >= sleep.next.from
                    ? 'Jetzt ist ein guter Zeitpunkt zum Hinlegen.'
                    : `Fenster ${fmtTime(sleep.next.from)} – ${fmtTime(sleep.next.to)} · Wachzeit ca. ${fmtDur(sleep.next.wakeWindowMin * 60_000)}`}
              </small>
              <small className="source">
                {sleep.next.source === 'personal'
                  ? `📈 Aus euren Daten (${sleep.next.samples} Wachphasen, 7 Tage)`
                  : '📘 Richtwerte für das Alter – wird mit mehr Einträgen persönlicher'}
              </small>
            </>
          ) : sleep.needsBirth ? (
            <>
              <span className="label">☀️ Wach seit {fmtDur(now - sleep.since!)}</span>
              <small>Geburtsdatum unter „Mehr“ eintragen, um eine Schlafvorhersage zu erhalten.</small>
            </>
          ) : (
            <>
              <span className="label">😴 Schlafvorhersage</span>
              <small>Trage den ersten Schlaf ein – danach schlägt die App das nächste Schlaffenster vor.</small>
            </>
          )}
        </div>
        <div className="card wide feed-card">
          {feed.feeding ? (
            <>
              <span className="label">🤱 Wird gerade gestillt</span>
              <strong>seit {fmtTime(running.find((e) => e.type === 'breast')!.start)}</strong>
            </>
          ) : feed.next && feed.last ? (
            <>
              <span className="label">🍼 Letzte Mahlzeit vor {fmtDur(now - feed.last.start)} ({entryMeta(feed.last).label}, {fmtTime(feed.last.start)})</span>
              <strong>Nächste Mahlzeit ca. {fmtTime(feed.next.est)}</strong>
              <TimeBar from={feed.last.start} a={feed.next.from} b={feed.next.to} now={now} />
              <small>
                {now > feed.next.to
                  ? 'Länger als üblich – auf Hungerzeichen achten.'
                  : now >= feed.next.from
                    ? 'Hunger ist jetzt wahrscheinlich.'
                    : `Zwischen ${fmtTime(feed.next.from)} und ${fmtTime(feed.next.to)}`}
              </small>
              <small className="source">
                {feed.next.source === 'personal'
                  ? `📈 Üblicher Abstand ${isNightNow ? 'nachts' : 'tagsüber'}: ca. ${fmtDur((feed.avgIntervalMin ?? 0) * 60_000)}`
                  : '📘 Richtwerte für das Alter – wird mit mehr Einträgen persönlicher'}
              </small>
            </>
          ) : (
            <>
              <span className="label">🍼 Mahlzeiten</span>
              <small>Trage Stillen oder Fläschchen ein – danach schätzt die App die nächste Mahlzeit.</small>
            </>
          )}
        </div>
        <div className="card">
          <span className="label">🌙 Schlafenszeit</span>
          <strong>{sleep.usualBedtime ? `üblich ${fmtTime(sleep.usualBedtime)}` : '–'}</strong>
          <small>
            {sleep.usualBedtime
              ? `Ø der letzten ${sleep.bedtimeSamples} Abende${sleep.typicalNaps ? ` · meist ${sleep.typicalNaps} Nickerchen` : ''}`
              : 'nach 3 Abenden mit „Schlafenszeit“'}
          </small>
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
              {next! <= now ? 'Nächste Gabe möglich' : `Nächste Gabe ab ${startOfDay(next!) > startOfDay(now) ? fmtDay(next!).toLowerCase() + ' ' : ''}${fmtTime(next!)}`}
            </strong>
            <small>Zuletzt {fmtDay(last!.start).toLowerCase()} um {fmtTime(last!.start)}{last!.dose ? ` (${last!.dose})` : ''} · Abstand {med.intervalH} h</small>
          </div>
        ))}
      </section>

      <h2 className="section-title">Schlaf</h2>
      <section className="grid grid-4">
        {sleepTiles.map((t) => (
          <button key={t.id} className={`tile ${t.active ? 'active' : ''}`} onClick={() => sleepAction(t.id)} style={{ ['--tile' as string]: t.color }}>
            <span className="tile-emoji">{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </section>
      <button className="link-btn" onClick={() => onOpen('sleep', undefined, 'nap')}>＋ Schlaf nachtragen</button>

      <h2 className="section-title">Essen & Pflege</h2>
      <section className="grid">
        {otherTiles.map((t) => {
          const meta = TYPES[t]
          const r = running.find((e) => e.type === t)
          return (
            <button key={t} className={`tile ${r ? 'active' : ''}`} onClick={() => tapTile(t)} style={{ ['--tile' as string]: meta.color }}>
              <span className="tile-emoji">{meta.emoji}</span>
              <span>{r ? 'Stopp' : meta.label}</span>
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
          <span>😴 {fmtDur(sleepMs)}{naps ? ` · ${naps} Nickerchen` : ''}</span>
          {nightWakes > 0 && <span>🦉 {nightWakes}× wach</span>}
          <span>🍼 {feeds}×{bottleMl ? ` · ${bottleMl} ml` : ''}</span>
          <span>🧷 {diapers}×</span>
        </div>
        <Timeline entries={dayEntries} now={now} onEdit={(e) => onOpen(e.type, e)} />
      </section>
    </>
  )
}

function TimeBar({ from, a, b, now }: { from: number; a: number; b: number; now: number }) {
  const end = Math.max(b + (b - a) * 0.3, now)
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - from) / (end - from)) * 100))}%`
  return (
    <div className="sleepbar" aria-hidden>
      <div className="sleepbar-window" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />
      <div className="sleepbar-now" style={{ left: pct(now) }} />
    </div>
  )
}
