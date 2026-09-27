// Plays the demo story in a real (headless) browser and saves the README
// screenshots to docs/screenshots/. Dev-only: not part of CI.
//
// It changes data (rides, payments, a rating), so start from a fresh world:
//   npm run db:reset-demo -w @teslapool/api
//   docker compose up -d --build --wait      (or run both apps with npm run dev)
//   npm run screenshots                       (BASE_URL defaults to http://localhost:3000)
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!PASSWORD) throw new Error('Set SEED_DEMO_PASSWORD (see .env.example)');
const OUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

/** A browser window of its own (separate cookies), signed in as one of the cast. */
async function open(name) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 860 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  if (name) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(`${name}@teslapool.test`);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/(passenger|driver)$/);
  }
  return page;
}

async function shot(page, file) {
  // No hover shade on the button just clicked, and no toast over the header.
  await page.mouse.move(0, 0);
  await page.addStyleTag({ content: '[data-sonner-toaster] { display: none !important; }' });
  // Finish CSS transitions first, or a just-clicked button is caught mid-fade.
  await page.screenshot({ path: `${OUT_DIR}${file}.png`, fullPage: true, animations: 'disabled' });
  console.log(`saved docs/screenshots/${file}.png`);
}

const person = (page, name) => page.getByRole('listitem').filter({ hasText: name });

async function requestRide(page, destination, { teslaPay = false } = {}) {
  await page.getByLabel('Pickup').selectOption({ label: 'Banani' });
  await page.getByLabel('Destination').selectOption({ label: destination });
  if (teslaPay) {
    const option = page
      .getByRole('group', { name: 'Payment' })
      .getByRole('button', { name: /TeslaPay/ });
    await option.click();
    await option.and(page.locator('[aria-pressed="true"]')).waitFor();
  }
  return page.getByRole('button', { name: /^Request ride · ৳/ });
}

// 1. The landing page.
const visitor = await open();
await visitor.goto('/');
await shot(visitor, '01-landing');

// 2. Nusrat prices a shared ride to Mohakhali with TeslaPay: ৳72 up front.
const nusrat = await open('nusrat');
const nusratRequest = await requestRide(nusrat, 'Mohakhali', { teslaPay: true });
await nusrat.getByText('Could drop to').waitFor();
await shot(nusrat, '02-request-fare');
await nusratRequest.click();
await nusrat.getByText('Looking for a Tesla leaving Banani').waitFor();

// 3. Jashim goes online at Banani and sees her request.
const jashim = await open('jashim');
await jashim
  .getByRole('group', { name: 'Availability' })
  .getByRole('button', { name: 'Online' })
  .click();
await jashim.getByText('Online in Banani').waitFor();
await person(jashim, 'Nusrat').waitFor();
await shot(jashim, '03-driver-feed');
await person(jashim, 'Nusrat').getByRole('button', { name: 'Accept' }).click();
await jashim.getByText('Head to Banani for pickup').waitFor();

// 4. Rafiq (cash, to Gulshan 1) is auto-matched into the same Bullet.
const rafiq = await open('rafiq');
await (await requestRide(rafiq, 'Gulshan 1')).click();
await rafiq.getByText('sharing with 1 other booking').waitFor();
await shot(rafiq, '04-auto-matched');

// 5. Shirin wants Gulshan 2: too big a detour for Nusrat, so she waits and
//    Jashim's feed says why.
const shirin = await open('shirin');
await (await requestRide(shirin, 'Gulshan 2')).click();
await shirin.getByText('Looking for a Tesla leaving Banani').waitFor();
await person(jashim, 'Shirin').waitFor();
await shot(jashim, '05-driver-pool');

// 6. Arrive, start (fares frozen), drop Nusrat off.
await jashim.getByRole('button', { name: /arrived at Banani/ }).click();
await jashim.getByRole('button', { name: 'Start trip' }).click();
await jashim.getByText('On the road').waitFor();
await person(jashim, 'Nusrat').getByRole('button', { name: 'Drop off' }).click();

// 7. Nusrat's ride page: final bill, rating form and timeline.
await nusrat.goto('/passenger/history');
await nusrat
  .getByRole('link', { name: /Banani → Mohakhali/ })
  .first()
  .click();
await nusrat.getByText('Dropped off at Mohakhali').waitFor();
await nusrat.getByText('How was your ride with Jashim?').waitFor();
await shot(nusrat, '06-ride-page');
await nusrat.getByLabel('5 stars').check({ force: true });
await nusrat
  .getByLabel('Comment (optional)')
  .fill('Quick and comfortable, even in Banani traffic.');
await nusrat.getByRole('button', { name: 'Submit rating' }).click();
await nusrat.getByText('You rated Jashim', { exact: true }).waitFor();

// 8. Rafiq is dropped off last; the trip lands in Jashim's history.
await person(jashim, 'Rafiq').getByRole('button', { name: 'Drop off' }).click();
await jashim.getByText('On the road').waitFor({ state: 'detached' });
await jashim.getByRole('link', { name: 'History', exact: true }).click();
await jashim.getByText('All finished trips').waitFor();
await shot(jashim, '07-driver-history');

// 9. Nusrat's ride history and TeslaPay ledger (৳500 − ৳72 − ৳72).
await nusrat.getByRole('link', { name: 'History', exact: true }).click();
await nusrat.getByText('Your rides').waitFor();
await shot(nusrat, '08-passenger-history');
await nusrat.getByRole('link', { name: 'TeslaPay', exact: true }).click();
await nusrat.getByText('TeslaPay balance').waitFor();
await shot(nusrat, '09-wallet');

// Leave no one waiting: Shirin cancels her request (free before a driver arrives).
await shirin.getByRole('button', { name: 'Cancel ride' }).click();
await shirin.getByRole('button', { name: 'Yes, cancel' }).click();
await shirin.getByText('Cancelled').first().waitFor();

await browser.close();
