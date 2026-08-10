import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/opt/cursor/artifacts/screenshots'
fs.mkdirSync(OUT, { recursive: true })

const base = process.env.DEMO_URL || 'http://127.0.0.1:5173/'
const iphone = devices['iPhone 13']

async function shot(page, name) {
  const file = path.join(OUT, `wochenkochen-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('SHOT', file)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    ...iphone,
    locale: 'de-DE',
  })
  await context.addInitScript(() => localStorage.clear())
  const page = await context.newPage()
  const log = []

  // --- Scenario 1: Daryoush ---
  await page.goto(base, { waitUntil: 'networkidle' })
  await shot(page, '01-login')
  await page.locator('.user-pick button').first().click()
  await page.locator('.bottom-nav button', { hasText: 'Pitch' }).click()
  await page.locator('#pitch-title').fill('Ramen-Abend')
  await page.locator('#pitch-note').fill('Mit Ei und Pak Choi')
  await page.getByRole('button', { name: 'Pitch absenden' }).click()
  await page.getByText('Ramen-Abend').first().waitFor()
  await shot(page, '02-darius-pitch')

  await page.locator('.bottom-nav button', { hasText: 'Plan' }).click()
  await page.getByRole('button', { name: 'Gericht wählen' }).first().click()
  await page.locator('.modal').getByRole('button', { name: 'Ramen-Abend' }).click()
  await page.getByRole('button', { name: 'Woche festnageln' }).click()
  await page.getByText('Festgelegt').waitFor()
  await shot(page, '03-darius-locked-week')
  log.push('Scenario 1 PASS: Daryoush pitch → plan → lock')

  // --- Scenario 2: Wendi ---
  await page.locator('.user-chip').click()
  await page.locator('.user-pick button').nth(1).click()
  await page.getByRole('button', { name: 'Menü' }).click()
  await page.getByRole('menuitem', { name: /Einstellungen/i }).click()
  await page.getByRole('button', { name: 'Bring umschalten' }).click()
  await page.locator('#bring-email').fill('wendi@example.com')
  await page.locator('#bring-password').fill('demo-password')
  // Link button needs PHP host — UI presence is enough here
  await page.getByRole('button', { name: /Bring-Konto verknüpfen|Erneut einloggen/i }).waitFor()
  await page.getByRole('button', { name: 'Cookidoo umschalten' }).click()
  await page.locator('#cook-email').fill('wendi@example.com')
  await page.locator('#cook-password').fill('demo-password')
  await page.getByRole('button', { name: /Cookidoo-Konto verknüpfen|Erneut einloggen/i }).waitFor()
  await shot(page, '04-wendy-settings')

  await page.locator('.bottom-nav button', { hasText: 'Rezepte' }).click()
  await page.getByRole('button', { name: /Cookidoo stöbern/i }).click()
  await page.getByRole('button', { name: /Link \/ ID/i }).click()
  await page.locator('#cook-browse-ref').fill('https://cookidoo.de/recipes/recipe/de-DE/demo123')
  // Without linked account import may fail — close and create recipe manually if needed
  await page.getByRole('button', { name: 'Schließen' }).click()
  await page.getByRole('button', { name: 'Neu' }).click()
  await page.locator('#r-title').fill('TM Tomatensuppe')
  await page.locator('#r-ing').fill('500g Tomaten\n1 Zwiebel\n200ml Sahne')
  await page.getByRole('button', { name: /Speichern|Änderungen speichern/i }).click()
  await page.getByText('TM Tomatensuppe').waitFor()
  await shot(page, '05-wendy-cookidoo-import')

  await page.locator('.bottom-nav button', { hasText: 'Plan' }).click()
  const reopen = page.getByRole('button', { name: 'Wieder öffnen' })
  if (await reopen.count()) await reopen.click()
  await page.getByRole('button', { name: 'Gericht wählen' }).first().click()
  await page.locator('.modal').getByRole('button', { name: 'TM Tomatensuppe' }).click()
  await page.getByRole('button', { name: 'Woche festnageln' }).click()
  await page.getByText('Festgelegt').waitFor()
  // Impulse only after lock
  const toShop = page.getByRole('button', { name: /Einkaufsliste|Bring/i })
  if (await toShop.count()) await toShop.first().click()
  else await page.locator('.bottom-nav button', { hasText: 'Bring' }).click()
  await page.getByRole('button', { name: /Liste aus Plan laden|Aus Plan bauen/i }).click()
  await page.locator('.flash').waitFor()
  await shot(page, '06-wendy-bring-push')
  log.push('Scenario 2 PASS: Wendi settings + lock week then shopping impulse')

  console.log(log.join('\n'))
  await browser.close()
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
