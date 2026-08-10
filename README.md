# Wochenkochen

Mobile-first weekly meal planner for **Darius & Wendy**.

Pitch dishes → vote → lock the week → then consciously send ingredients to **Bring!**. Optional **Cookidoo** login to import recipes.

---

## Download & upload to your website

**Branch:** `cursor/wochenkochen-web-demo-c171`

### Option A — only the finished site (recommended)

1. Download / clone this branch from GitHub  
2. Open folder: `wochenkochen/www/`  
3. Upload **all contents** of `www/` to your webspace (FTP / file manager):

```
index.html
favicon.svg
assets/
api/bring.php
api/cookidoo.php
api/store.php
api/data/.htaccess
```

4. Open the URL where `index.html` lives  

**Requirements:** PHP + curl + **PDO_SQLite** on the host (Bring / Cookidoo / shared DB).  
The SQLite file is created automatically at `api/data/wochenmahl.sqlite` (not downloadable thanks to `.htaccess`).  
There is **no `dist` folder** — `www/` is the uploadable build.

### Option B — full source

```bash
git clone -b cursor/wochenkochen-web-demo-c171 <your-repo-url>
cd Sphere_Visualization/wochenkochen
npm install
npm run build   # refreshes www/
```

---

## How the app works

| Step | What |
|------|------|
| 1 | Login as **Darius** or **Wendy** |
| 2 | **Pitch** ideas (Yes / Maybe / Nope). Bases like *Reis* can get different sides. |
| 3 | **Plan** — assign meals to days (base → then side if needed) |
| 4 | **Woche festnageln** — plan freezes |
| 5 | Only then: load shopping list / **Jetzt an Bring senden** |

Top-left **Menü**: Einstellungen · Hilfe · Abmelden  

Bottom nav: Plan · Pitch · Rezepte — **Bring** tab only if Bring is enabled in Settings.

### Recipes

- Types: **Gericht** · **Basis** (e.g. rice) · **Beilage**  
- Seed examples included for testing (rice, noodles, sides, pasta, tacos, …)  
- Add new recipes anytime under Rezepte → Neu  

### Cookidoo (optional)

1. Menü → Einstellungen → enable Cookidoo  
2. Enter e-mail + password + country → link account  
3. Rezepte → Cookidoo import → paste link/ID → **Vom Konto laden**  
4. Or save title + ingredients manually if auto-login fails  

### Bring! (optional)

1. Menü → Einstellungen → enable Bring  
2. Enter e-mail + password → link → choose list  
3. After the week is **locked**: Einkaufsliste → load from plan → **Jetzt an Bring senden**  

Nothing is sent to Bring during the pitch phase.

---

## Local development

```bash
cd wochenkochen
npm install
npm run dev
```

```bash
npm run build          # write www/
node scripts/logic-check.mjs
```

---

## Notes

- On a PHP host, household data (recipes, pitches, week plan, settings) syncs via **SQLite** (`api/store.php` → `api/data/wochenmahl.sqlite`) so Darius & Wendy share one stand  
- Browser `localStorage` is still used as cache / offline fallback; “who is logged in” stays device-local  
- Local Vite without PHP = browser-only (see Settings → Gemeinsamer Speicher)  
- Passwords are not persisted — only session tokens after a successful link (those tokens are part of shared settings once linked)  
- Bring / Cookidoo use unofficial APIs via PHP proxies; Cookidoo password-grant may stop working if Vorwerk changes auth
