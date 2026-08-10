# Wochenmahl

**Gemeinsam die Woche kochen — ohne Zettelchaos.**

Wochenmahl ist eure kleine App für den Wochenplan: Ideen vorschlagen, Gerichte eintragen, die Woche festmachen und die Einkaufsliste (optional) direkt an **Bring!** schicken. Rezepte könnt ihr selbst anlegen oder — wenn ihr möchtet — aus **Cookidoo** holen.

- **App öffnen:** [media-acht.de/Wochenessen](https://media-acht.de/Wochenessen/)
- **Code:** [GitHub · Wochenmahl](https://github.com/DaryoushDjavadi/Wochenmahl)

---

## Für wen ist das?

Für euch beide (Daryoush & Wendi) — auf dem Handy oder am Computer. Beide sehen denselben Plan, dieselben Rezepte und denselben Einkauf, sobald jemand etwas ändert.

Kein Extra-Install nötig: einfach die Website öffnen und einloggen.

---

## Was kann die App?

### Kurz gesagt

1. **Ideen pitchen** — „Was wäre cool diese Woche?“
2. **Woche planen** — Gerichte auf die Wochentage legen
3. **Festnageln** — Plan steht, Einkauf wird daraus gebaut
4. **Einkaufen** — Liste prüfen, was schon daheim ist abhaken, Rest optional an Bring senden

### Im Detail

| Bereich | Was ihr damit macht |
|--------|----------------------|
| **Plan** | Mo–So befüllen, mehrere Gerichte pro Tag, Kalender für andere Wochen |
| **Pitch** | Vorschläge machen und mit Ja / Vielleicht / Nee abstimmen |
| **Rezepte** | Eigene Bibliothek: Gerichte, Basis (z. B. Reis), Beilagen — inkl. eigener Kategorien |
| **Einkauf** | Automatisch aus dem Plan; Zutaten „auf Lager“ zählen nicht mit |
| **Bring!** | Optional: fertige Liste an eure Bring-App schicken (auch nachträglich nur das Neue) |
| **Cookidoo** | Optional: Konto verknüpfen, suchen, Link einfügen → Zutaten laden |
| **Profil** | Name und Emoji-Avatar in den Einstellungen |

Kleine Extras: Emotes unter den Gerichten, sanfte Animationen, der zuletzt geöffnete Tab bleibt nach dem Neuladen merken.

---

## So nutzt ihr es (ohne Technik)

1. Seite öffnen → als **Daryoush** oder **Wendi** einloggen  
2. Unten zwischen **Plan**, **Pitch** und **Rezepte** wechseln  
3. Ideen pitchen oder direkt Gerichte in den Plan legen  
4. Wenn die Woche passt: **Woche festnageln**  
5. Einkaufsliste prüfen → was schon da ist antippen („Auf Lager“)  
6. Optional: **an Bring senden**

Oben rechts: Menü mit Einstellungen, Hilfe und Abmelden.  
Im Plan-Kopf: Kalender, um eine andere Woche zu wählen.

**Tipp:** Bring und Cookidoo sind optional. Ohne Verknüpfung funktioniert der Wochenplan trotzdem.

---

## Was schon gut läuft

- Gemeinsamer Haushalt-Speicher (beide Geräte bleiben synchron)
- Pitch → Plan → Festnageln → Einkauf
- Mehrere Gerichte pro Tag, Basis + Beilage
- Eigene Kategorien für Rezepte
- „Auf Lager“ für Zutaten, die nicht in den Einkauf sollen
- Bring nur mit dem, was noch fehlt (kein Doppel-Spam)
- Cookidoo-Suche und Import per Link
- Profil mit Name & Emoji
- Undo beim Rezept-Löschen (kurz rückgängig machen)

---

## Roadmap

Ideen für die nächsten Schritte — Reihenfolge kann sich ändern, je nachdem, was euch wichtiger ist.

### Bald

- [ ] Bessere Sync-Zusammenführung (wenn beide gleichzeitig tippen)
- [ ] Undo/Hinweise, die auch beim Tab-Wechsel bleiben
- [ ] Portionsgröße / Personenanzahl → Zutatenmengen anpassen
- [ ] Einkaufsliste drucken oder teilen (ohne Bring)

### Später

- [ ] Erinnerung: „Woche noch nicht geplant“ / „Einkauf nicht gesendet“
- [ ] Favoriten & „oft gekocht“-Statistik
- [ ] Mehr als zwei Personen im Haushalt
- [ ] Als App auf dem Homescreen (PWA) mit Offline-Grundfunktionen
- [ ] Fotos zu eigenen Rezepten

### Offen / abhängig von außen

- [ ] Bring- & Cookidoo-Anbindung pflegen, falls die Anbieter etwas ändern
- [ ] Captcha/2FA bei Cookidoo eleganter abfangen

Habt ihr einen Wunsch? Einfach sagen — dann wandert er nach oben auf die Liste.

---

## Für Technik-Interessierte

Kurz und nur falls nötig:

| Thema | Info |
|------|------|
| Frontend | Vite, React, Zustand — Build landet in `www/` |
| Sync | PHP + SQLite auf dem Webspace (`api/store.php`) |
| Bring / Cookidoo | PHP-Proxys (`api/bring.php`, `api/cookidoo.php`) |
| Lokal | `npm install` → `npm run dev` → http://localhost:5173 |
| Build | `npm run build` schreibt nach `www/` |

**Webspace aktualisieren:** Inhalt von `www/` nach dem Ordner `Wochenessen` hochladen. Die Datei `api/data/wochenmahl.sqlite` **nicht löschen** — darin steckt euer gemeinsamer Stand.

Passwörter von Bring/Cookidoo werden nicht dauerhaft gespeichert; nach dem Verknüpfen bleiben nur Session-Tokens in den Einstellungen.
