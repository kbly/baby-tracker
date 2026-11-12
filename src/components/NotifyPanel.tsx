import { useState } from 'react'
import { notifySupported, permission, testNotification, updateNotifySettings, useNotifySettings } from '../notify'

export default function NotifyPanel() {
  const s = useNotifySettings()
  const [msg, setMsg] = useState('')
  const perm = permission()
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone

  async function toggle(key: 'sleep' | 'feed' | 'med', value: boolean) {
    setMsg('')
    const r = await updateNotifySettings({ [key]: value })
    if (r === 'denied') setMsg('Benachrichtigungen wurden nicht erlaubt. Du kannst sie in den Einstellungen des Handys für diese App freigeben.')
  }

  return (
    <section className="panel">
      <h2>Erinnerungen</h2>
      {!notifySupported ? (
        <p className="hint">
          {isIOS && !standalone
            ? 'Auf dem iPhone funktionieren Erinnerungen nur, wenn die App über „Teilen → Zum Home-Bildschirm“ installiert ist (ab iOS 16.4). Öffne sie dann über das Symbol auf dem Home-Bildschirm.'
            : 'Dieser Browser unterstützt keine Benachrichtigungen.'}
        </p>
      ) : (
        <>
          <Toggle label="😴 Schlaffenster beginnt bald" on={s.sleep} onChange={(v) => toggle('sleep', v)} />
          <Toggle label="🍼 Nächste Mahlzeit steht bald an" on={s.feed} onChange={(v) => toggle('feed', v)} />
          <Toggle label="💊 Nächste Medikamentengabe möglich" on={s.med} onChange={(v) => toggle('med', v)} />
          <label className="field">
            <span>Vorlaufzeit</span>
            <div className="seg">
              {[0, 10, 15, 30].map((m) => (
                <button key={m} className={s.lead === m ? 'on' : ''} onClick={() => updateNotifySettings({ lead: m })}>
                  {m === 0 ? 'pünktlich' : `${m} min vorher`}
                </button>
              ))}
            </div>
          </label>
          {perm === 'denied' && <p className="error">Benachrichtigungen sind für diese App blockiert. Bitte in den Handy-/Browser-Einstellungen erlauben.</p>}
          {msg && <p className="error">{msg}</p>}
          {perm === 'granted' && <button className="ghost" onClick={() => void testNotification()}>Test-Benachrichtigung senden</button>}
          <p className="hint">
            Die Erinnerungen kommen, solange die App geöffnet ist oder im Hintergrund läuft. Ist die App ganz geschlossen, kommen keine Erinnerungen.
          </p>
        </>
      )}
    </section>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="toggle-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`switch ${on ? 'on' : ''}`}><i /></span>
    </button>
  )
}
