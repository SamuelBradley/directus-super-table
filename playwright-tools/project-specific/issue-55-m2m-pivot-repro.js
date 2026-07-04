import { chromium } from 'playwright';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * Issue #55 — Smoke test for v0.4.1 hotfix
 *
 * Verifies two regressions are fixed:
 *  - Bug 1: M2M pivot 403 on /items/<root> caused by the display-field
 *    expansion path injecting pivot-bypass field selectors.
 *  - Bug 2: Collection-switch leaking stale display fields into the next
 *    collection's fetch (`fields[]=<previous_collection>.foo`).
 *
 * Strategy:
 *  - Scenario 1: navigate sequentially to N collections that use the
 *    super-layout-table, capture every 4xx/5xx response on /items/.
 *  - Scenario 2: switch between collections in sequence and capture the
 *    first /items/* request after each switch, so we can verify the
 *    `fields[]` param does not contain a previous-collection prefix.
 *
 * Environment:
 *  - BASE_URL defaults to http://localhost:8058 (nginx proxy returns 502).
 *  - HEADLESS=false to watch the browser run.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8058';
const HEADLESS = process.env.HEADLESS !== 'false';
const EMAIL = 'admin@example.com';
const PASSWORD = 'd1r3ctu5';

const SCREENSHOT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../screenshots/issue-55'
);
const REPORT_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'issue-55-smoke-report.json'
);

const NAV_TIMEOUT_MS = 15_000;

// Collections to probe for Bug 1 (M2M smoke).
const SCENARIO_1_COLLECTIONS = [
  'pages',
  'content_block',
  'content_headline',
  'content_image',
  'expandable',
];

// Ordered transitions for Bug 2 (collection switch).
const SCENARIO_2_TRANSITIONS = [
  { from: 'pages', to: 'content_headline' },
  { from: 'content_headline', to: 'content_block' },
  { from: 'content_block', to: 'pages' },
];

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Pulls the `fields[]` query params (preserving order) from an /items/ URL,
 * so the report can show whether stale collection-prefixed fields leaked in.
 */
function extractFieldsParam(url) {
  try {
    const u = new URL(url);
    const values = u.searchParams.getAll('fields[]');
    if (values.length > 0) return values;
    const single = u.searchParams.get('fields');
    if (single) return single.split(',');
    return [];
  } catch {
    return [];
  }
}

/**
 * Extracts the collection name out of `/items/<collection>` so we can tell
 * which collection a request is targeting (and detect cross-collection leaks).
 */
function extractCollectionFromUrl(url) {
  const match = url.match(/\/items\/([^/?]+)/);
  return match ? match[1] : null;
}

async function attachItemsNetworkTracking(page) {
  const errors = [];
  const itemsRequests = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/items/')) return;

    const status = response.status();
    const requestUrl = response.request().url();
    const collection = extractCollectionFromUrl(url);
    const fields = extractFieldsParam(requestUrl);

    const entry = {
      time: new Date().toISOString(),
      url,
      status,
      collection,
      fields,
    };

    itemsRequests.push(entry);

    if (status >= 400) {
      const errorEntry = { ...entry };
      // Best-effort: capture the response body for debugging context.
      try {
        const text = await response.text();
        errorEntry.bodyExcerpt = text.substring(0, 500);
      } catch {
        // Body may already be consumed or stream closed — non-fatal.
      }
      errors.push(errorEntry);
      console.log(
        chalk.red(`[items 4xx/5xx] ${status} ${collection} — ${url}`)
      );
    }
  });

  return { errors, itemsRequests };
}

async function login(page) {
  console.log(chalk.cyan(`Navigating to ${BASE_URL}/admin/login`));
  await page.goto(`${BASE_URL}/admin/login`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });

  // Directus is a SPA — the login form mounts after the JS bundle parses.
  // Wait for the actual input fields to exist before typing.
  await page.waitForSelector('input[type="email"]', {
    timeout: NAV_TIMEOUT_MS,
  });

  // If already authenticated, Directus client-side redirects out of /login.
  if (!page.url().includes('/login')) {
    console.log(chalk.green('Already authenticated — skipping login form.'));
    return;
  }

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // SPA routing — wait for the URL to leave /login rather than waitForNavigation.
  try {
    await page.waitForURL((url) => !url.toString().includes('/login'), {
      timeout: NAV_TIMEOUT_MS,
    });
  } catch {
    throw new Error(
      `Login failed — still on ${page.url()} after submitting credentials.`
    );
  }

  console.log(chalk.green(`Logged in — now at ${page.url()}`));
}

/**
 * Navigates to a collection's content view and waits for the table to render.
 * Returns whether at least one row materialised, so the report can flag empty
 * collections separately from rendering failures.
 */
async function gotoCollection(page, collection) {
  const target = `${BASE_URL}/admin/content/${collection}`;
  await page.goto(target, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });

  // The table renders after the first /items/ response settles; give it a beat.
  try {
    await page.waitForSelector('.v-table, .render-template, .no-items', {
      timeout: NAV_TIMEOUT_MS,
    });
  } catch {
    // Don't throw — the report will still log network errors and screenshot.
  }

  // Allow lazy-rendered cells to paint before snapshotting.
  await page.waitForTimeout(1500);

  const rowCount = await page
    .locator('.v-table tbody tr')
    .count()
    .catch(() => 0);

  return rowCount > 0;
}

/**
 * Snapshots both viewport and full page so issues that appear below the fold
 * (pagination, footer errors) are still captured.
 */
async function snapshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function runScenario1(page, tracker) {
  console.log(chalk.cyan('\n=== Scenario 1: M2M-relations smoke ==='));
  const results = [];

  for (const collection of SCENARIO_1_COLLECTIONS) {
    console.log(chalk.gray(`→ ${collection}`));
    const errorsBefore = tracker.errors.length;
    let tableRendered = false;
    let navError = null;

    try {
      tableRendered = await gotoCollection(page, collection);
    } catch (err) {
      navError = err.message;
    }

    const errorsForThisCollection = tracker.errors
      .slice(errorsBefore)
      .filter((e) => e.collection === collection);

    const screenshotPath = await snapshot(page, `scenario1-${collection}`);

    results.push({
      collection,
      tableRendered,
      navError,
      errors: errorsForThisCollection,
      screenshot: screenshotPath,
    });

    const status =
      errorsForThisCollection.length === 0
        ? chalk.green('OK')
        : chalk.red(`${errorsForThisCollection.length} error(s)`);
    console.log(
      `  ${status} — table rendered: ${tableRendered ? 'yes' : 'no'}`
    );
  }

  return results;
}

async function runScenario2(page, tracker) {
  console.log(chalk.cyan('\n=== Scenario 2: Collection-switch ==='));

  // Seed at the first "from" so the first transition's `firstItemsRequest`
  // really reflects the switch and not the initial cold load.
  await gotoCollection(page, SCENARIO_2_TRANSITIONS[0].from);

  const results = [];

  for (const { from, to } of SCENARIO_2_TRANSITIONS) {
    console.log(chalk.gray(`→ ${from} → ${to}`));

    const errorsBefore = tracker.errors.length;
    const requestsBefore = tracker.itemsRequests.length;

    let navError = null;
    let tableRendered = false;
    try {
      tableRendered = await gotoCollection(page, to);
    } catch (err) {
      navError = err.message;
    }

    const newRequests = tracker.itemsRequests.slice(requestsBefore);
    const firstItemsRequest =
      newRequests.find((r) => r.collection === to) || null;

    // Specifically interesting: any request that hit the destination
    // collection's URL but carried a field prefixed with the previous
    // collection's name. That's the Bug 2 fingerprint.
    const leakedFields = newRequests
      .filter((r) => r.collection === to)
      .flatMap((r) =>
        r.fields
          .filter((f) => f.includes('.') && f.startsWith(`${from}.`))
          .map((f) => ({ url: r.url, field: f }))
      );

    const errorsForTransition = tracker.errors
      .slice(errorsBefore)
      .filter((e) => e.collection === to);

    const screenshotPath = await snapshot(page, `scenario2-${from}-to-${to}`);

    results.push({
      from,
      to,
      tableRendered,
      navError,
      firstItemsRequest,
      leakedFields,
      errors: errorsForTransition,
      screenshot: screenshotPath,
    });

    const status =
      errorsForTransition.length === 0 && leakedFields.length === 0
        ? chalk.green('OK')
        : chalk.red('issues');
    console.log(
      `  ${status} — first /items/ ${
        firstItemsRequest ? firstItemsRequest.status : 'n/a'
      }, leaks: ${leakedFields.length}`
    );
  }

  return results;
}

async function main() {
  ensureDir(SCREENSHOT_DIR);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  const tracker = await attachItemsNetworkTracking(page);

  try {
    await login(page);
  } catch (err) {
    console.log(chalk.red(`Login failure: ${err.message}`));
    await browser.close();
    process.exit(1);
  }

  let scenario1 = [];
  let scenario2 = [];

  try {
    scenario1 = await runScenario1(page, tracker);
    scenario2 = await runScenario2(page, tracker);
  } catch (err) {
    console.log(chalk.red(`Scenario crashed: ${err.message}`));
  }

  // Aggregate pass/fail. PASS requires zero 4xx/5xx on /items/ AND no
  // cross-collection leaked fields after a switch.
  const scenario1Errors = scenario1.reduce(
    (acc, r) => acc + r.errors.length,
    0
  );
  const scenario2Errors = scenario2.reduce(
    (acc, r) => acc + r.errors.length,
    0
  );
  const scenario2Leaks = scenario2.reduce(
    (acc, r) => acc + r.leakedFields.length,
    0
  );

  const overallStatus =
    scenario1Errors === 0 && scenario2Errors === 0 && scenario2Leaks === 0
      ? 'PASS'
      : 'FAIL';

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    overallStatus,
    summary: {
      scenario1Errors,
      scenario2Errors,
      scenario2Leaks,
      totalItemsRequests: tracker.itemsRequests.length,
    },
    scenario1,
    scenario2,
    allItemsErrors: tracker.errors,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('\n' + chalk.bold('=== Smoke summary ==='));
  console.log(`Scenario 1 errors: ${scenario1Errors}`);
  console.log(`Scenario 2 errors: ${scenario2Errors}`);
  console.log(`Scenario 2 leaks:  ${scenario2Leaks}`);
  console.log(
    `Overall: ${
      overallStatus === 'PASS'
        ? chalk.green(overallStatus)
        : chalk.red(overallStatus)
    }`
  );
  console.log(`Report: ${REPORT_PATH}`);

  await browser.close();
  process.exit(overallStatus === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.log(chalk.red(`Fatal: ${err.message}`));
  console.log(err.stack);
  process.exit(1);
});
