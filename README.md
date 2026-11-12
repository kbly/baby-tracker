# Baby Tracker

Eine Web-App (PWA) zum Erfassen von Schlaf, Stillen, Fläschchen, Beikost, Windeln, Medikamenten, Abpumpen, Wachstum und Notizen – mit altersabhängiger Schlafvorhersage und Statistiken.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Den Ordner `dist/` kannst du auf einen beliebigen statischen Host legen (Netlify, Vercel, GitHub Pages …).
Auf dem Handy öffnen → „Zum Home-Bildschirm hinzufügen“ – dann verhält sie sich wie eine App und läuft auch offline.

## Funktionen

- **Schnellerfassung**: 9 Kacheln; Schlaf startet/stoppt mit einem Tipp
- **Timer** für Schlaf, Stillen und Abpumpen (laufen weiter, auch wenn die App geschlossen wird), Seitenwechsel beim Stillen
- **Schlafvorhersage**: nächstes Schlaffenster aus altersabhängigen Wachfenstern
- **Medikamente**: Mindestabstand je Medikament, Anzeige „Nächste Gabe ab …“
- **Tagesansicht** mit Zusammenfassung, Einträge antippen zum Bearbeiten/Löschen
- **Statistik**: Durchschnittswerte, 24-h-Tagesrhythmus, Balkendiagramme (7/14/30 Tage), Wachstumstabelle
- **Daten**: Export/Import als JSON, Beispieldaten, Dark Mode

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/types.ts` | Datenmodell und Eintragstypen (Farben, Emojis) |
| `src/store.ts` | Zustand + Speicherung in `localStorage` |
| `src/utils.ts` | Zeitformatierung, Alter, Schlafvorhersage (`WAKE_WINDOWS`) |
| `src/components/Today.tsx` | Startseite: Timer, Karten, Kacheln, Tagesverlauf |
| `src/components/EntrySheet.tsx` | Formular zum Anlegen/Bearbeiten |
| `src/components/Stats.tsx` | Statistiken |
| `src/components/Settings.tsx` | Babyprofil, Medikamente, Datensicherung |

## Mögliche nächste Schritte

- Sync zwischen beiden Elternteilen (z. B. Supabase oder Firebase statt `localStorage`)
- Erinnerungen per Push-Benachrichtigung (z. B. Medikamente)
- Native App mit React Native/Expo bzw. Capacitor für App Store / Play Store
