# Wochenkochen / Wochenmahl

Mobile-first Wochenplaner für **Daryoush & Wendi**.

Ablauf: Gerichte **pitchen** → **planen** → **Woche festnageln** → Einkaufsliste bearbeiten → optional an **Bring!** senden. Optional **Cookidoo** verknüpfen, suchen und Rezepte importieren.

- **GitHub:** https://github.com/DaryoushDjavadi/Wochenmahl (`main`)
- **Live:** https://media-acht.de/Wochenessen/

---

## Webspace hochladen

Fertige Site liegt in `www/` (kein `dist/`).

1. `npm run build` (oder fertigen Stand von `main` nehmen)
2. **Inhalt** von `www/` nach `…/Wochenessen/` hochladen (SFTP/FTP)
3. SQLite-Datei `api/data/wochenmahl.sqlite` **nicht überschreiben/löschen**

```
index.html
favicon.svg
assets/
api/bring.php
api/cookidoo.php
api/store.php
api/data/.htaccess
api/data/.gitignore
```

**Host-Voraussetzungen:** PHP mit **curl** und **PDO_SQLite**.  
Die DB wird automatisch unter `api/data/wochenmahl.sqlite` angelegt (Zugriff per `.htaccess` blockiert).

---

## So funktioniert die App

| Schritt | Was |
|--------|-----|
| 1 | Als **Daryoush** oder **Wendi** einloggen |
| 2 | **Pitch** — Ideen vorschlagen, mit Ja / Vielleicht / Nee reagieren. Basis (z. B. Reis) + Beilage möglich |
| 3 | **Plan** — Tage befüllen; Tag antippen → Zutaten & Details |
| 4 | **Woche festnageln** — Plan steht |
| 5 | Einkaufsliste laden/bearbeiten → optional **an Bring senden** |

**Oben:** Home (zurück zum Plan) · Menü (Einstellungen / Hilfe / Abmelden) · User-Chip  
**Kalender** im Wochenkopf: andere Woche wählen (geplant / festgelegt)  
**Unten:** Plan · Pitch · Rezepte — Tab **Bring** nur wenn Bring in den Einstellungen an ist

### Rezepte

- Typen: **Gericht** · **Basis** · **Beilage**
- Neu anlegen, **Anpassen**, **Duplizieren**
- Demo-Rezepte sind enthalten (u. a. Kokos-Kichererbsen-Curry mit korrektem Cookidoo-Link)

### Cookidoo (optional)

1. Menü → Einstellungen → Cookidoo an
2. E-Mail, Passwort, Land (meist **DE**) → verknüpfen  
   Login läuft über den Browser-**OAuth2**-Cookie-Flow (`api/cookidoo.php`)
3. Rezepte → **Cookidoo stöbern**:
   - **Suche** im Katalog
   - **Meine Listen** (Konto)
   - **Link / ID** einfügen und importieren

Bei Captcha/2FA kann der Auto-Login scheitern — dann weiter per Link/ID.

### Bring! (optional)

1. Einstellungen → Bring an → Login → Liste wählen
2. Erst **nach** „Woche festnageln“: Einkaufsliste → bearbeiten → **Jetzt an Bring senden**

Während der Pitch-Phase wird nichts an Bring geschickt.

### Gemeinsamer Speicher

Auf dem PHP-Webspace teilen Daryoush & Wendi Rezepte, Pitches, Wochenplan und Einstellungen über **SQLite** (`api/store.php`).  
Wer eingeloggt ist, bleibt **gerätelokal**. Ohne PHP (nur Vite) läuft alles im Browser-`localStorage`.

---

## Lokal entwickeln

```bash
cd wochenkochen
npm install
npm run dev          # http://localhost:5173
npm run build        # schreibt www/
```

Für Bring/Cookidoo/Sync lokal brauchst du PHP (oder den Webspace).

---

## Technik

| Teil | Details |
|------|---------|
| Frontend | Vite + React + Zustand (`www/` Build) |
| Sync | `api/store.php` + SQLite |
| Bring | `api/bring.php` |
| Cookidoo | `api/cookidoo.php` (OAuth2-Session-Cookies, Suche unter `/search/{locale}`) |

**Hinweise**

- Passwörter werden nicht dauerhaft gespeichert — nach erfolgreichem Link nur Session-Tokens/Cookies in den Settings
- Bring und Cookidoo nutzen inoffizielle APIs; Vorwerk/Bring können Auth oder Endpunkte ändern
- Mobile Layout: schmale Displays kürzen Topbar/Texte, damit Home, Menü und Kalender nicht überlappen

---

## Aktueller Stand

Branch **`main`** ist der Upload-/Deploy-Stand. Nach Änderungen:

```bash
npm run build
git add -A && git commit && git push origin main
# www/* → nur Ordner Wochenessen auf dem Webspace
```
