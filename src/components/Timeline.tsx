import type { Entry } from '../types'
import { TYPES } from '../types'
import { describe, fmtTime } from '../utils'

interface Props {
  entries: Entry[]
  now: number
  onEdit: (e: Entry) => void
}

export default function Timeline({ entries, now, onEdit }: Props) {
  if (entries.length === 0) {
    return <p className="empty">Noch keine Einträge an diesem Tag.</p>
  }
  return (
    <ul className="timeline">
      {entries.map((e) => {
        const meta = TYPES[e.type]
        const running = meta.timed && e.end === undefined
        return (
          <li key={e.id}>
            <button className="tl-item" onClick={() => onEdit(e)}>
              <span className="tl-time">
                {fmtTime(e.start)}
                {meta.timed && <small>{e.end !== undefined ? fmtTime(e.end) : 'läuft'}</small>}
              </span>
              <span className="badge" style={{ background: meta.color }}>{meta.emoji}</span>
              <span className="tl-body">
                <strong>{meta.label}</strong>
                <span className={running ? 'running' : ''}>{describe(e, now)}</span>
                {e.note && e.type !== 'note' && <em>{e.note}</em>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
