import { useState } from 'react'
import { createFamily, joinFamily, signIn, signOut, signUp, syncNow, useSync } from '../sync'
import { fmtTime } from '../utils'

export default function SyncPanel() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  async function run(fn: () => Promise<string | undefined | void>) {
    setBusy(true)
    setMsg('')
    try {
      const r = await fn()
      if (r === 'confirm') setMsg('Fast geschafft: Bitte den Link in der E-Mail anklicken und dich danach hier anmelden.')
      else if (r) setMsg(r)
    } finally {
      setBusy(false)
    }
  }

  if (!sync.configured) {
    return (
      <section className="panel">
        <h2>Gemeinsam nutzen</h2>
        <p className="hint">
          Der Abgleich zwischen mehreren Handys ist noch nicht eingerichtet. Die Anleitung steht in der README unter „Gemeinsam nutzen“.
        </p>
      </section>
    )
  }

  if (!sync.email) {
    return (
      <section className="panel">
        <h2>Gemeinsam nutzen</h2>
        <p className="hint">Melde dich an, damit ihr beide auf euren Handys dieselben Daten seht.</p>
        <label className="field"><span>E-Mail</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Passwort</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {msg && <p className="error">{msg}</p>}
        <div className="actions">
          <button className="ghost" disabled={busy} onClick={() => run(() => signUp(email, password))}>Konto erstellen</button>
          <button className="primary" disabled={busy} onClick={() => run(() => signIn(email, password))}>Anmelden</button>
        </div>
      </section>
    )
  }

  if (!sync.family) {
    return (
      <section className="panel">
        <h2>Gemeinsam nutzen</h2>
        <p className="hint">Angemeldet als {sync.email}</p>
        <div className="choice">
          <strong>Ich fange an</strong>
          <p className="hint">Erstellt eine Familie und lädt die Daten von diesem Handy hoch. Danach bekommst du einen Code für deinen Partner.</p>
          <button className="primary" disabled={busy} onClick={() => run(createFamily)}>Familie erstellen</button>
        </div>
        <div className="choice">
          <strong>Ich habe einen Code</strong>
          <p className="hint">Die Einträge auf diesem Handy werden durch die gemeinsamen Daten ersetzt.</p>
          <div className="row">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. 4F9A21C7" autoCapitalize="characters" />
            <button className="ghost" disabled={busy || code.trim().length < 4} onClick={() => {
              if (confirm('Die Einträge auf diesem Handy werden durch die gemeinsamen Daten ersetzt. Fortfahren?')) run(() => joinFamily(code))
            }}>Beitreten</button>
          </div>
        </div>
        {msg && <p className="error">{msg}</p>}
        <button className="ghost" onClick={() => run(signOut)}>Abmelden</button>
      </section>
    )
  }

  const phaseText = {
    off: 'Nicht verbunden',
    idle: sync.pending ? `${sync.pending} Änderung(en) warten auf Upload` : 'Alles synchronisiert',
    syncing: 'Synchronisiere …',
    offline: `Offline – ${sync.pending} Änderung(en) werden später hochgeladen`,
    error: `Fehler: ${sync.error ?? 'unbekannt'}`,
  }[sync.phase]

  return (
    <section className="panel">
      <h2>Gemeinsam nutzen</h2>
      <p className="hint">Angemeldet als {sync.email}</p>
      <div className="invite">
        <span className="hint">Einladungscode für deinen Partner</span>
        <strong>{sync.family.inviteCode}</strong>
        <button className="ghost" onClick={() => {
          void navigator.clipboard?.writeText(sync.family!.inviteCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
        }}>{copied ? '✓ Kopiert' : 'Kopieren'}</button>
      </div>
      <p className="hint">
        So geht's: Dein Partner öffnet die App, erstellt unter „Mehr“ ein eigenes Konto und gibt diesen Code bei „Ich habe einen Code“ ein.
      </p>
      <p className={`sync-line ${sync.phase}`}>
        <span className="dot" /> {phaseText}
        {sync.lastSync && sync.phase === 'idle' ? ` · ${fmtTime(sync.lastSync)}` : ''}
      </p>
      <div className="actions">
        <button className="ghost" disabled={busy} onClick={() => run(syncNow)}>↻ Jetzt synchronisieren</button>
        <button className="ghost" disabled={busy} onClick={() => {
          if (confirm('Abmelden? Die Daten bleiben auf diesem Handy, werden aber nicht mehr abgeglichen.')) run(signOut)
        }}>Abmelden</button>
      </div>
    </section>
  )
}
