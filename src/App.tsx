import { useState } from 'react'
import type { Entry, EntryType } from './types'
import { useNow, useStore } from './store'
import { ageText } from './utils'
import Today from './components/Today'
import Stats from './components/Stats'
import Settings from './components/Settings'
import EntrySheet from './components/EntrySheet'

type Tab = 'today' | 'stats' | 'settings'

export default function App() {
  const state = useStore()
  const now = useNow(60_000)
  const [tab, setTab] = useState<Tab>(() => (state.baby.birth ? 'today' : 'settings'))
  const [sheet, setSheet] = useState<{ type: EntryType; entry?: Entry } | null>(null)

  const title = state.baby.name || 'Baby Tracker'
  const age = ageText(state.baby.birth, now)

  return (
    <div className="app">
      <header className="top">
        <div className="avatar">{state.baby.name ? state.baby.name[0].toUpperCase() : '👶'}</div>
        <div>
          <h1>{title}</h1>
          {age && <p>{age} alt</p>}
        </div>
      </header>

      <main>
        {tab === 'today' && <Today onOpen={(type, entry) => setSheet({ type, entry })} />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav className="tabs">
        <button className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}><span>🏠</span>Heute</button>
        <button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}><span>📊</span>Statistik</button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}><span>⚙️</span>Mehr</button>
      </nav>

      {sheet && <EntrySheet key={sheet.entry?.id ?? sheet.type} type={sheet.type} entry={sheet.entry} onClose={() => setSheet(null)} />}
    </div>
  )
}
