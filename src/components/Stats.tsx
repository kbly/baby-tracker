import { useState } from 'react'
import { useNow, useStore } from '../store'
import { addDays, DAY, fmtDur, HOUR, overlap, startOfDay } from '../utils'
import type { Entry } from '../types'

interface DayStat {
  day: number
  sleepMs: number
  napMs: number
  naps: number
  feeds: number
  breastMs: number
  bottleMl: number
  diapers: number
  dirty: number
  entries: Entry[]
}

const RANGES = [7, 14, 30]

export default function Stats() {
  const state = useStore()
  const now = useNow(60_000)
  const [range, setRange] = useState(7)
  const today = startOfDay(now)

  const days: DayStat[] = []
  for (let i = range - 1; i >= 0; i--) {
    const day = addDays(today, -i)
    const end = day + DAY
    const es = state.entries.filter((e) => e.start < end && (e.end ?? (e.type === 'sleep' || e.type === 'breast' || e.type === 'pump' ? now : e.start)) >= day)
    const own = es.filter((e) => e.start >= day)
    const sleeps = es.filter((e) => e.type === 'sleep')
    // Tagschlaf = Schlaf zwischen 7 und 19 Uhr
    const napMs = sleeps.reduce((s, e) => s + overlap(e, day + 7 * HOUR, day + 19 * HOUR, now), 0)
    days.push({
      day,
      sleepMs: sleeps.reduce((s, e) => s + overlap(e, day, end, now), 0),
      napMs,
      naps: own.filter((e) => e.type === 'sleep' && new Date(e.start).getHours() >= 7 && new Date(e.start).getHours() < 19).length,
      feeds: own.filter((e) => e.type === 'breast' || e.type === 'bottle').length,
      breastMs: own.filter((e) => e.type === 'breast').reduce((s, e) => s + ((e.end ?? now) - e.start), 0),
      bottleMl: own.filter((e) => e.type === 'bottle').reduce((s, e) => s + (e.amountMl ?? 0), 0),
      diapers: own.filter((e) => e.type === 'diaper').length,
      dirty: own.filter((e) => e.type === 'diaper' && e.diaper !== 'wet').length,
      entries: es,
    })
  }

  // Durchschnitt ohne den laufenden Tag
  const past = days.slice(0, -1).filter((d) => d.entries.length > 0)
  const avg = (f: (d: DayStat) => number) => (past.length ? past.reduce((s, d) => s + f(d), 0) / past.length : 0)

  const growth = state.entries.filter((e) => e.type === 'growth').sort((a, b) => b.start - a.start)

  return (
    <>
      <div className="seg range">
        {RANGES.map((r) => (
          <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r} Tage</button>
        ))}
      </div>

      <section className="cards">
        <div className="card"><span className="label">Ø Schlaf / Tag</span><strong>{fmtDur(avg((d) => d.sleepMs))}</strong><small>davon tagsüber {fmtDur(avg((d) => d.napMs))}</small></div>
        <div className="card"><span className="label">Ø Mahlzeiten</span><strong>{avg((d) => d.feeds).toFixed(1).replace('.', ',')}×</strong><small>{Math.round(avg((d) => d.bottleMl))} ml Fläschchen</small></div>
        <div className="card"><span className="label">Ø Windeln</span><strong>{avg((d) => d.diapers).toFixed(1).replace('.', ',')}×</strong><small>{avg((d) => d.dirty).toFixed(1).replace('.', ',')}× mit Stuhlgang</small></div>
        <div className="card"><span className="label">Ø Tagschläfe</span><strong>{avg((d) => d.naps).toFixed(1).replace('.', ',')}</strong><small>zwischen 7 und 19 Uhr</small></div>
      </section>

      <h2 className="section-title">Tagesrhythmus</h2>
      <div className="rhythm">
        <div className="rhythm-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        {days.slice().reverse().map((d) => (
          <div key={d.day} className="rhythm-row">
            <span className="rhythm-label">{new Date(d.day).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' })}</span>
            <div className="rhythm-bar">
              {d.entries.map((e) => {
                const s = Math.max(e.start, d.day)
                const left = ((s - d.day) / DAY) * 100
                if (e.type === 'sleep') {
                  const en = Math.min(e.end ?? now, d.day + DAY)
                  return <i key={e.id} className="r-sleep" style={{ left: `${left}%`, width: `${((en - s) / DAY) * 100}%` }} />
                }
                if (e.start < d.day) return null
                if (e.type === 'breast' || e.type === 'bottle' || e.type === 'solids')
                  return <i key={e.id} className="r-feed" style={{ left: `${left}%` }} />
                if (e.type === 'diaper') return <i key={e.id} className="r-diaper" style={{ left: `${left}%` }} />
                if (e.type === 'medicine') return <i key={e.id} className="r-med" style={{ left: `${left}%` }} />
                return null
              })}
            </div>
          </div>
        ))}
        <div className="legend">
          <span><i className="r-sleep" /> Schlaf</span>
          <span><i className="r-feed" /> Mahlzeit</span>
          <span><i className="r-diaper" /> Windel</span>
          <span><i className="r-med" /> Medizin</span>
        </div>
      </div>

      <Bars title="Schlaf pro Tag" days={days} value={(d) => d.sleepMs / HOUR} fmt={(v) => `${v.toFixed(1).replace('.', ',')} h`} cls="b-sleep" />
      <Bars title="Mahlzeiten pro Tag" days={days} value={(d) => d.feeds} fmt={(v) => `${v}`} cls="b-feed" />
      {days.some((d) => d.bottleMl) && (
        <Bars title="Fläschchen (ml)" days={days} value={(d) => d.bottleMl} fmt={(v) => `${v}`} cls="b-feed" />
      )}
      <Bars title="Windeln pro Tag" days={days} value={(d) => d.diapers} fmt={(v) => `${v}`} cls="b-diaper" />

      {growth.length > 0 && (
        <>
          <h2 className="section-title">Wachstum</h2>
          <table className="growth">
            <thead><tr><th>Datum</th><th>Gewicht</th><th>Größe</th><th>Kopf</th></tr></thead>
            <tbody>
              {growth.map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.start).toLocaleDateString('de-DE')}</td>
                  <td>{g.weightKg ? `${g.weightKg.toLocaleString('de-DE')} kg` : '–'}</td>
                  <td>{g.heightCm ? `${g.heightCm.toLocaleString('de-DE')} cm` : '–'}</td>
                  <td>{g.headCm ? `${g.headCm.toLocaleString('de-DE')} cm` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

function Bars({ title, days, value, fmt, cls }: {
  title: string
  days: DayStat[]
  value: (d: DayStat) => number
  fmt: (v: number) => string
  cls: string
}) {
  const vals = days.map(value)
  const max = Math.max(1, ...vals)
  const dense = days.length > 14
  return (
    <>
      <h2 className="section-title">{title}</h2>
      <div className={`bars ${dense ? 'dense' : ''}`}>
        {days.map((d, i) => (
          <div key={d.day} className="bar-col" title={`${new Date(d.day).toLocaleDateString('de-DE')}: ${fmt(vals[i])}`}>
            {!dense && <span className="bar-val">{vals[i] ? fmt(vals[i]) : ''}</span>}
            <div className="bar-track"><div className={`bar ${cls}`} style={{ height: `${(vals[i] / max) * 100}%` }} /></div>
            <span className="bar-label">
              {dense ? new Date(d.day).getDate() : new Date(d.day).toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
