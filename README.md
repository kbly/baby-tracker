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
- **Daten**: Export/Import als JSON, Beispieldaten, Dark Mode

## Gemeinsam nutzen (Abgleich zwischen zwei Handys)

Die Daten liegen dann in deinem eigenen, kostenlosen Supabase-Projekt. Auf jedem Handy bleibt zusätzlich eine Kopie, sodass die App auch offline funktioniert.

1. Auf https://supabase.com kostenlos registrieren → **New project** (Region z. B. *Central EU (Frankfurt)*, Datenbank-Passwort sicher notieren).
2. Im Projekt links **SQL Editor** öffnen, den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run** drücken.
3. **Authentication → Sign In / Providers → Email**: „Confirm email“ ausschalten (dann ist kein Bestätigungslink nötig).
   Alternativ eingeschaltet lassen und unter **Authentication → URL Configuration** als *Site URL* `https://kbly.github.io/baby-tracker/` eintragen.
4. **Project Settings → API**: *Project URL* und den *anon public* (bzw. *publishable*) Key kopieren.
   Dieser Schlüssel ist für die Verwendung in Apps gedacht und darf öffentlich sein; geschützt werden die Daten durch die Zugriffsregeln aus Schritt 2.
5. Auf GitHub im Repo **Settings → Secrets and variables → Actions → Reiter „Variables“ → New repository variable**:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon/publishable Key
6. **Actions → „Auf GitHub Pages veröffentlichen“ → Run workflow**.
7. In der App unter **Mehr → Gemeinsam nutzen**: Konto erstellen → **Familie erstellen** → Einladungscode an den Partner geben.
   Der Partner erstellt auf seinem Handy ein eigenes Konto und tritt mit dem Code bei.

Für die lokale Entwicklung die Werte in eine Datei `.env.local` schreiben:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/types.ts` | Datenmodell und Eintragstypen (Farben, Emojis) |
| `src/store.ts` | Zustand + Speicherung in `localStorage` |
| `src/predict.ts` | Vorhersagen für Schlaf, Schlafenszeit und Mahlzeiten |
| `src/notify.ts` | Lokale Erinnerungen |
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
