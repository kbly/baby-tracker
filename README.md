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

- **Schlaf mit einem Tipp**: Aufwachen, Nickerchen, Schlafenszeit, nächtliches Aufwachen / wieder eingeschlafen
- **Gemeinsam nutzen**: Beide Eltern sehen dieselben Daten in Echtzeit (über Supabase, siehe unten)
- **Schnellerfassung** für Stillen, Fläschchen, Windel, Beikost, Medizin, Abpumpen, Wachstum, Notiz
- **Timer** für Schlaf, Stillen und Abpumpen (laufen weiter, auch wenn die App geschlossen wird), Seitenwechsel beim Stillen
- **Schlafvorhersage**: nächstes Nickerchen bzw. Schlafenszeit aus den persönlichen Wachzeiten der letzten 7 Tage (je nach Tageszeit / wievieltes Nickerchen); bei zu wenigen Daten altersabhängige Richtwerte
- **Mahlzeit-Vorhersage**: nächste Mahlzeit aus den üblichen Abständen (getrennt für Tag und Nacht)
- **Übliche Schlafenszeit** aus den letzten Abenden
- **Erinnerungen** (Schlaffenster, Mahlzeit, Medikament) als Benachrichtigung, solange die App geöffnet ist oder im Hintergrund läuft
- **Medikamente**: Mindestabstand je Medikament, Anzeige „Nächste Gabe ab …“
- **Tagesansicht** mit Zusammenfassung, Einträge antippen zum Bearbeiten/Löschen
- **Statistik**: Durchschnittswerte, 24-h-Tagesrhythmus, Balkendiagramme (7/14/30 Tage), Wachstumstabelle
- **Export**: als Tabelle (CSV, öffnet direkt in Excel) oder komplette Sicherung (JSON)
- **Import**: CSV-Dateien anderer Apps (z. B. Napper) mit automatischer Spalten- und Typ-Erkennung, Zuordnung anpassbar, Vorschau, Duplikate werden übersprungen; JSON-Sicherung wiederherstellen
- Beispieldaten, Dark Mode

## Gemeinsam nutzen (Abgleich zwischen zwei Handys)

Die App ist mit dem Supabase-Projekt **Qube** (`bomgobasuuirjpvxonzc`) verbunden. URL und öffentlicher Schlüssel stehen in `.env.production`. Dieser Schlüssel ist für Apps gedacht und darf öffentlich sein, die Daten schützen die Zugriffsregeln aus `supabase/schema.sql`.

In der App unter **Mehr → Gemeinsam nutzen**: Konto erstellen → **Familie erstellen** → Einladungscode an den Partner geben. Der Partner erstellt ein eigenes Konto und tritt mit dem Code bei.

### Datenbank verwalten (Supabase-Agent)

`scripts/supabase-agent.mjs` richtet Supabase ein und prüft die Schnittstelle (siehe auch `.claude/agents/supabase-setup.md`):

```
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=bomgobasuuirjpvxonzc node scripts/supabase-agent.mjs setup
node scripts/supabase-agent.mjs verify
```

`setup` spielt das Schema ein und konfiguriert die Anmeldung. `verify` testet mit Testkonten Familie, Einladung, Abgleich und Zugriffsschutz und räumt danach auf.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/types.ts` | Datenmodell und Eintragstypen (Farben, Emojis) |
| `src/store.ts` | Zustand + Speicherung in `localStorage` |
| `src/predict.ts` | Vorhersagen für Schlaf, Schlafenszeit und Mahlzeiten |
| `src/notify.ts` | Lokale Erinnerungen |
| `src/csv.ts` | CSV-Export, CSV-Parser und Import-Zuordnung |
| `src/sync.ts` | Abgleich mit Supabase (Anmeldung, Familie, Upload-Warteschlange, Echtzeit) |
| `supabase/schema.sql` | Datenbank-Tabellen und Zugriffsregeln |
| `src/utils.ts` | Zeitformatierung, Alter, Schlafvorhersage (`WAKE_WINDOWS`) |
| `src/components/Today.tsx` | Startseite: Timer, Karten, Kacheln, Tagesverlauf |
| `src/components/EntrySheet.tsx` | Formular zum Anlegen/Bearbeiten |
| `src/components/Stats.tsx` | Statistiken |
| `src/components/Settings.tsx` | Babyprofil, Medikamente, Datensicherung |

## Mögliche nächste Schritte

- Erinnerungen auch bei komplett geschlossener App (Web-Push über einen Server, z. B. Supabase Edge Function)
- Native App mit React Native/Expo bzw. Capacitor für App Store / Play Store
